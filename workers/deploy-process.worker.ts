import type { Job } from "bullmq";
import { db } from "../config/db.js";
import { services } from "../schema/database/services.js";
import { eq } from "drizzle-orm";
import {
  DeployErrorMessage,
  DockerBasedDeploy,
  GithubBasedDeploy,
  UpdateDeployment,
} from "../service/deploy.service.js";
import { DEPLOY_TYPE, DEPLOYMENT_STATUS } from "../constants.js";
import { CreateLogBuffer } from "../service/deploy-logs.service.js";
import { deployments } from "../schema/database/deployments.js";

type DeployJobData = {
  deployment_id: string;
  service_id: string;
  rollback_id?: string;
};

export async function ProcessDeployments(data: Job<DeployJobData>) {
  if (!data || !data.data || !data.data.service_id || !data.data.deployment_id)
    return;

  const { deployment_id, service_id, rollback_id } = data.data;

  const logs = CreateLogBuffer(deployment_id);
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

    if (rollback_id) {
      const [target] = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, rollback_id));

      if (!target || !target.image_tag) {
        throw new Error("Rollback target has no image");
      }

      logs.Push("system", `Rolling back to ${rollback_id.slice(0, 8)}`);
      await UpdateDeployment(deployment_id, { commit_sha: target.commit_sha });
      await DockerBasedDeploy(
        target.image_tag,
        deployment_id,
        service,
        !target.image_tag.includes("@"),
        logs.Push,
      );
    } else if (DEPLOY_TYPE_NUM === DEPLOY_TYPE.DOCKER) {
      if (!service.image_url) throw new Error("Image url is missing");
      await DockerBasedDeploy(
        service.image_url,
        deployment_id,
        service,
        false,
        logs.Push,
      );
    } else if (DEPLOY_TYPE_NUM === DEPLOY_TYPE.GITHUB) {
      if (!service.branch) throw new Error("Branch is missing");
      await GithubBasedDeploy(deployment_id, service, logs.Push);
    } else {
      throw new Error("Unsupported deploy type");
    }
  } catch (e) {
    const message = DeployErrorMessage(e);
    logs.Push("stderr", message);
    await UpdateDeployment(deployment_id, {
      status: DEPLOYMENT_STATUS.FAILED,
      error: message,
      finished_on: new Date(),
    });
    throw e;
  } finally {
    await logs.Close();
  }
}
