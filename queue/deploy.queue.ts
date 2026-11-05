import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const DEPLOYMENT_QUEUE_KEY = "deployments";

export const deployQueue = new Queue(DEPLOYMENT_QUEUE_KEY, {
  connection: redisConnection,
});

export async function EnqueueDeployment(
  deployment_id: string,
  service_id: string,
) {
  await deployQueue.add(
    "deploy",
    { deployment_id, service_id },
    {
      jobId: deployment_id,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}
