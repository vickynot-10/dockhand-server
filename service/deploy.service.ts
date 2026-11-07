import type {
  DeployParams,
  GitHubOptions,
  OnLog,
} from "../types/deploy.types.js";
import { deployments } from "../schema/database/deployments.js";
import { db } from "../config/db.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { EnqueueDeployment } from "../queue/deploy.queue.js";
import { and, eq, ne } from "drizzle-orm";

import {
  GetImage,
  PullImage,
  RemoveContainer,
  RunContainer,
} from "../utils/docker.js";
import { config } from "dotenv";
import { services } from "../schema/database/services.js";
import { BuildWithGithub } from "../utils/github.js";

config();

export async function DeployService(data: DeployParams) {
  const { user_id, project_id, service_id, deploy_type } = data;

  const [createDeployment] = await db
    .insert(deployments)
    .values({
      user_id,
      project_id,
      service_id,
      trigger: data.trigger_type,
      deploy_type: Number(deploy_type),
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

export async function UpdateDeployment(
  deployment_id: string,
  values: Partial<typeof deployments.$inferInsert>,
) {
  await db
    .update(deployments)
    .set(values)
    .where(eq(deployments.id, deployment_id));
}

async function RemoveOldContainers(
  service_id: string,
  currentDeploymentID: string,
) {
  const previous_deployments = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.service_id, service_id),
        eq(deployments.status, DEPLOYMENT_STATUS.RUNNING),
        ne(deployments.id, currentDeploymentID),
      ),
    );
  if (!previous_deployments || previous_deployments.length <= 0) return;
  for (const item of previous_deployments) {
    if (!item) continue;
    if (item.container_name) {
      await RemoveContainer(item.container_name);
    }
    await UpdateDeployment(item.id, { status: DEPLOYMENT_STATUS.SUPERSEDED });
  }
}

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "localhost";

export async function DockerBasedDeploy(
  image: string,
  deployment_id: string,
  service_data: typeof services.$inferSelect,
  skip_pull: boolean,
  onLog?: OnLog,
) {
  if (!image) {
    throw new Error("Image is Not found");
  }
  const host_name = `${service_data.slug}.${BASE_DOMAIN}`;

  const container_name = `${service_data.slug}-${deployment_id.slice(0, 8)}`;

  try {
    // Pull image first
    if (skip_pull === false) {
      onLog?.("system", `Pulling ${image}`);
      await PullImage(image);
    }
    const image_ref = await GetImage(image);

    const DEFAULT_PORT = Number(
      service_data.port ?? process.env.DEFAULT_APP_PORT ?? 80,
    );

    await RemoveOldContainers(service_data.id, deployment_id);
    onLog?.("system", "Starting container");
    await RunContainer({
      name: container_name,
      image: image_ref,
      slug: service_data.slug,
      port: DEFAULT_PORT,
      hostname: host_name,
      env_vars: service_data.env_vars ?? [],
    });

    // Finish deployment

    await UpdateDeployment(deployment_id, {
      status: DEPLOYMENT_STATUS.RUNNING,
      image_tag: image_ref,
      container_name,
      error: null,
      finished_on: new Date(),
    });

    onLog?.("system", `Running at ${host_name}`);

    await db
      .update(services)
      .set({
        host: host_name,
        updated_on: new Date(),
      })
      .where(eq(services.id, service_data.id));
  } catch (e) {
    await RemoveContainer(container_name).catch(() => {});
    await UpdateDeployment(deployment_id, {
      status: DEPLOYMENT_STATUS.FAILED,
      error: DeployErrorMessage(e),
      finished_on: new Date(),
    });
    throw e;
  }
}

export function DeployErrorMessage(e: unknown) {
  const err = e as { code?: string; message?: string };
  if (err?.code === "ECONNREFUSED" || err?.code === "ENOENT") {
    return "Docker daemon is not reachable";
  }
  return err?.message ?? "Deployment failed";
}

export async function GithubBasedDeploy(
  deployment_id: string,
  service_data: typeof services.$inferSelect,
  onLog?: OnLog,
) {
  if (!service_data.repo_full_name) {
    throw new Error("Repository is not set");
  }

  const branch = service_data.branch ?? "main";
  const root = (service_data.root_directory ?? "").replace(/^\/+|\/+$/g, "");
  if (root.split("/").includes("..")) {
    throw new Error("Invalid root directory");
  }

  const deploy_options: GitHubOptions = {
    repo_name: service_data.repo_full_name,
    branch,
    root,
    user_id: service_data.user_id,
    slug: service_data.slug,
  };

  const { imageTag, commit_sha } = await BuildWithGithub(deploy_options, onLog);
  await UpdateDeployment(deployment_id, {
    commit_sha,
  });
  await DockerBasedDeploy(imageTag, deployment_id, service_data, true, onLog);
}
