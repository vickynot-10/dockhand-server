import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const CONTAINER_ACTION_QUEUE_KEY = "container-actions";

export type ContainerActionType = "delete" | "suspend" | "resume";

export const containerActionQueue = new Queue(CONTAINER_ACTION_QUEUE_KEY, {
  connection: redisConnection,
});

export async function EnqueueDeploymentActions(
  deployment_id: string,
  service_id: string,
  type: ContainerActionType,
  container_name: string,
) {
  await containerActionQueue.add(
    `${type}-container`,
    { deployment_id, service_id, container_name, type },
    {
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}
