import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";

import { deployments } from "../schema/database/deployments.js";

import { deployment_logs } from "../schema/database/deploy-logs.js";
import { services } from "../schema/database/services.js";
import { DEPLOY_TRIGGER, DEPLOYMENT_STATUS } from "../constants.js";
import { EnqueueDeployment } from "../queue/deploy.queue.js";
import { UpdateDeployment } from "../service/deploy.service.js";

export async function GetDeployMentlogs(req: Request, res: Response) {
  const id = req.query.id as string | undefined;

  if (!id) {
    return send_error(res, 400, "Invalid Payload!");
  }

  const {
    user_id,
    env_vars,
    slug,
    root_directory,
    build_command,
    output_directory,
    repo_id,
    created_on,
    updated_on,
    ...serviceColumns
  } = getTableColumns(services);

  const {
    user_id: deployUser,
    project_id,
    service_id,
    ...deploymentCOls
  } = getTableColumns(deployments);

  const [rows] = await db
    .select({
      service: serviceColumns,
      deployment: deploymentCOls,
      deployment_logs: sql`
        COALESCE(
          jsonb_agg(
            to_jsonb(${deployment_logs})
            ORDER BY ${deployment_logs.id} DESC
          ) FILTER (
            WHERE ${deployment_logs.id} IS NOT NULL
          ),
          '[]'::jsonb
        )
      `.as("deployment_logs"),
    })
    .from(deployments)
    .leftJoin(
      deployment_logs,
      eq(deployment_logs.deployment_id, deployments.id),
    )
    .leftJoin(services, eq(services.id, deployments.service_id))
    .where(eq(deployments.id, id))
    .groupBy(services.id, deployments.id);

  if (!rows) {
    return send_error(res, 404, "Deployment not found!");
  }

  return send_success(res, 200, rows);
}

export async function RollbackToDeployment(req: Request, res: Response) {
  const { deployment_id, service_id } = req.body;

  if (!deployment_id || !service_id) {
    return send_error(res, 400, "Invalid Payload!");
  }

  const [target] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.id, deployment_id),
        eq(deployments.service_id, service_id),
      ),
    );

  if (!target) {
    return send_error(res, 404, "Deployment not found !");
  }

  const [inFlight] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(
      and(
        eq(deployments.service_id, service_id),
        inArray(deployments.status, [
          DEPLOYMENT_STATUS.QUEUED,
          DEPLOYMENT_STATUS.BUILDING,
        ]),
      ),
    );

  if (inFlight) {
    return send_error(res, 409, "A deployment is already in progress");
  }

  if (
    target.status !== DEPLOYMENT_STATUS.RUNNING &&
    target.status !== DEPLOYMENT_STATUS.SUPERSEDED
  ) {
    const statusMessages: Record<number, string> = {
      [DEPLOYMENT_STATUS.QUEUED]: "Target deployment is still queued.",
      [DEPLOYMENT_STATUS.BUILDING]: "Target deployment is still building.",
      [DEPLOYMENT_STATUS.FAILED]: "Cannot rollback to a failed deployment.",
      [DEPLOYMENT_STATUS.CANCELLED]:
        "Cannot rollback to a cancelled deployment.",
      [DEPLOYMENT_STATUS.SUSPENDED]:
        "Cannot rollback to a suspended deployment.",
    };

    return send_error(
      res,
      400,
      statusMessages[target.status] ??
        "Target deployment is not eligible for rollback.",
    );
  }

  const user_id = req.user!.id;

  const [created] = await db
    .insert(deployments)
    .values({
      user_id,
      project_id: target.project_id,
      service_id,
      trigger: DEPLOY_TRIGGER.ROLLBACK,
      deploy_type: target.deploy_type,
      status: DEPLOYMENT_STATUS.QUEUED,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create deployment");
  }

  try {
    await EnqueueDeployment(created.id, service_id, deployment_id);
  } catch (e) {
    await UpdateDeployment(created.id, {
      status: DEPLOYMENT_STATUS.FAILED,
      error: "Failed to queue deployment",
      finished_on: new Date(),
    });
    throw e;
  }
  return send_success(res, 200, target, "Rollback Deploy Started");
}
