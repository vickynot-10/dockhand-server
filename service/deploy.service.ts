import type { DeployParams } from "../types/deploy.types.js";
import { deployments } from "../schema/database/deployments.js";
import { db } from "../config/db.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { EnqueueDeployment } from "../queue/deploy.queue.js";
import { eq } from "drizzle-orm";
export async function DeployService(data: DeployParams) {
  const { user_id, project_id, service_id, deploy_type } = data;

  const [createDeployment] = await db
    .insert(deployments)
    .values({
      user_id,
      project_id,
      service_id,
      deploy_type: Number(deploy_type),
      started_on: new Date(),
      status: DEPLOYMENT_STATUS.QUEUED,
    })
    .returning();

  if (!createDeployment) {
    throw new Error("Failed to create deployment");
  }

  try {
    await EnqueueDeployment(createDeployment.id, service_id);
  } catch (e) {
    await db
      .update(deployments)
      .set({
        status: DEPLOYMENT_STATUS.FAILED,
        error: "Failed to queue deployment",
        finished_on: new Date(),
      })
      .where(eq(deployments.id, createDeployment.id));

    throw e;
  }

  return true;
}
