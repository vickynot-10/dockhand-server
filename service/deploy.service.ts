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
  HealthCheckCOntainer,
  PullImage,
  RemoveContainer,
  RunContainer,
} from "../utils/docker.js";
import { config } from "dotenv";
import { services } from "../schema/database/services.js";
import { BuildWithGithub } from "../utils/github.js";
import { emitter } from "../utils/emitter.js";
import { BuildHostName, BuildPublicUrl } from "../utils/domain.js";

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
  const rows = await db
    .update(deployments)
    .set(values)
    .where(eq(deployments.id, deployment_id))
    .returning({
      id: deployments.id,
      service_id: deployments.service_id,
      status: deployments.status,
    });

  if (values.status === undefined) return;

  for (const row of rows) {
    emitter.to(`service:${row.service_id}`).emit("deployment_status", {
      deployment_id: row.id,
      status: row.status,
    });
  }
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
  for (const item of previous_deployments) {
    await UpdateDeployment(item.id, { status: DEPLOYMENT_STATUS.SUPERSEDED });
    if (!item.container_name) continue;
    try {
      await RemoveContainer(item.container_name);
    } catch (e) {
      console.error("Failed to remove old container", item.container_name, e);
    }
  }
}

export function DeployErrorMessage(e: unknown) {
  const err = e as { code?: string; syscall?: string; message?: string };
  const is_socket_error =
    (err?.code === "ECONNREFUSED" || err?.code === "ENOENT") &&
    err?.syscall === "connect";
  if (is_socket_error) return "Docker daemon is not reachable";
  return err?.message ?? "Deployment failed";
}

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

  const host_name = BuildHostName(service_data.slug);

  const container_name = `${service_data.slug}-${service_data.project_id}--${deployment_id.slice(0, 8)}`;

  try {
    // Pull image first
    if (skip_pull === false) {
      onLog?.("system", `Pulling ${image}`);
      await PullImage(image);
    }

    const image_ref = skip_pull ? image : await GetImage(image);

    const DEFAULT_PORT = Number(
      service_data.port ?? process.env.DEFAULT_APP_PORT ?? 3000,
    );

    onLog?.("system", "Starting container");
    await RunContainer({
      service_name: service_data.name,
      project_id: service_data.project_id,
      name: container_name,
      image: image_ref,
      slug: service_data.slug,
      port: DEFAULT_PORT,
      hostname: host_name,
      env_vars: service_data.env_vars ?? [],
    });

    const { reason, healthy } = await HealthCheckCOntainer({
      name: container_name,
      port: DEFAULT_PORT,
      project_id: service_data.project_id,
    });

    if (!healthy) {
      onLog?.("stderr", reason ?? "Health check failed");
      await RemoveContainer(container_name);
      throw new Error(reason ?? "Health check failed");
    }

    onLog?.("system", "Health check passed");
    await RemoveOldContainers(service_data.id, deployment_id);
    onLog?.("system", "Updating Deployments");
    // Finish deployment

    await UpdateDeployment(deployment_id, {
      status: DEPLOYMENT_STATUS.RUNNING,
      image_tag: image_ref,
      container_name,
      error: null,
      finished_on: new Date(),
    });

    const FINAL_HOST = BuildPublicUrl(host_name);

    onLog?.("system", `Running at ${FINAL_HOST}`);

    await db
      .update(services)
      .set({
        host: FINAL_HOST,
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

export async function GithubBasedDeploy(
  deployment_id: string,
  service_data: typeof services.$inferSelect,
  onLog?: OnLog,
  rebuild_sha?: string,
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
    runtime: Number(service_data.runtime),
    start_command: service_data.start_command,
    type: service_data.type,
    slug: service_data.slug,
    port: service_data.port,
    use_dockerfile: service_data.use_dockerfile ?? false,
    output_directory: service_data.output_directory as string,
    build_command: service_data.build_command as string,
    env_vars: service_data.env_vars ?? [],
    commit_sha: rebuild_sha ?? undefined,
  };

  const { imageTag, commit_sha } = await BuildWithGithub(deploy_options, onLog);
  await UpdateDeployment(deployment_id, {
    commit_sha,
  });
  await DockerBasedDeploy(imageTag, deployment_id, service_data, true, onLog);
}
