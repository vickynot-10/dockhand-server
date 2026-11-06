import { Worker } from "bullmq";
import { ProcessContainerActions } from "./container-action-process.worker.js";
import {
  ConnectRedis,
  DisconnectRedis,
  redisConnection,
} from "../config/redis.js";
import { CONTAINER_ACTION_QUEUE_KEY } from "../queue/container-actions.queue.js";
async function StartContainerActionWorker() {
  await ConnectRedis();

  const worker = new Worker(
    CONTAINER_ACTION_QUEUE_KEY,
    ProcessContainerActions,
    {
      connection: redisConnection.duplicate(),
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Container action ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Container action ${job?.id} failed`, err);
  });

  async function shutdown() {
    await worker.close();
    await DisconnectRedis();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

StartContainerActionWorker().catch((e) => {
  console.error(e, "from container action worker");
  process.exit(1);
});
