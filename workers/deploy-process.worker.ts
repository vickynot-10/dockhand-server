import type { Job } from "bullmq";
import { db } from "../config/db.js";
import { services } from "../schema/database/services.js";
import { eq } from "drizzle-orm";
import {
  DockerBasedDeploy,
  UpdateDeployment,
} from "../service/deploy.service.js";
import { DEPLOY_TYPE, DEPLOYMENT_STATUS } from "../constants.js";

type DeployJobData = { deployment_id: string; service_id: string };

export async function ProcessDeployments(data: Job<DeployJobData>) {
  if (!data || !data.data || !data.data.service_id || !data.data.deployment_id)
    return;

  const { deployment_id, service_id } = data.data;

  try {
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, service_id));

    if (!service) {
      console.log("Service not found !");
      throw new Error("Service not found");
    }

    const DEPLOY_TYPE_NUM = Number(service.deploy_type);

    await UpdateDeployment(deployment_id, {
      started_on: new Date(),
      status: DEPLOYMENT_STATUS.BUILDING,
      deploy_type: DEPLOY_TYPE_NUM,
    });

    if (DEPLOY_TYPE_NUM === DEPLOY_TYPE.DOCKER && service.image_url) {
      await DockerBasedDeploy(service.image_url, deployment_id, service);
    }
  } catch (e) {
    console.error(e, "from deploy process");
  }

  return "ok";
}
