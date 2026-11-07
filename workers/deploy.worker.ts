import { Worker, Job } from "bullmq";
import { ProcessDeployments } from "./deploy-process.worker.js";
import {
  ConnectRedis,
  DisconnectRedis,
  redisConnection,
} from "../config/redis.js";
import { DEPLOYMENT_QUEUE_KEY } from "../queue/deploy.queue.js";
import { PingDocker } from "../utils/docker.js";
import {
  ReconcileStatuses,
  WatchContainerEvents,
} from "../service/docker-container.service.js";

async function StartDeployWorker() {
  await ConnectRedis();
  await PingDocker();
  await ReconcileStatuses();
  await WatchContainerEvents();

  const worker = new Worker(DEPLOYMENT_QUEUE_KEY, ProcessDeployments, {
    connection: redisConnection.duplicate(),
    concurrency: 1,
  });

  worker.on("completed", (job) => {
    console.log(`From worker ${job.id} completed`);
  });

  worker.on("failed", (job) => {
    console.error(`From worker error ${job?.id}`);
  });

  async function shutdown() {
    await worker.close();
    await DisconnectRedis();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

StartDeployWorker().catch((e) => {
  console.log(e, "from deploy worker");
  process.exit(0);
});
