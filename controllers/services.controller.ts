import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { services } from "../schema/database/services.js";
import {
  ActionServiceSchema,
  SaveServiceSchema,
} from "../schema/zod/services.schema.js";
import { CreateService } from "../service/service.service.js";
import { DeployService } from "../service/deploy.service.js";
import { deployments } from "../schema/database/deployments.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { EnqueueDeploymentActions } from "../queue/container-actions.queue.js";

function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function SaveServices(req: Request, res: Response) {
  const userId = req.user!.id;

  const parsed = SaveServiceSchema.safeParse(req.body);

  if (!parsed.success) {
    return send_error(
      res,
      400,
      parsed.error.issues[0]?.message ?? "Fill All required Fields",
    );
  }

  const data = parsed.data;

  const isSlugExists = await db
    .select({ slug: services.slug })
    .from(services)
    .where(eq(services.slug, data.slug));

  if (isSlugExists.length > 0) {
    return send_error(
      res,
      409,
      `A Subdomain with ${data.slug} already Exists !`,
    );
  }

  let service;

  try {
    service = await CreateService(userId, data);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return send_error(
        res,
        409,
        `A Subdomain with ${data.slug} already Exists !`,
      );
    }
    throw error;
  }

  if (!service) {
    return send_error(res, 400, "Failed to Insert !");
  }

  try {
    await DeployService({
      user_id: userId,
      project_id: service.project_id,
      service_id: service.id,
      deploy_type: service.deploy_type,
    });
    return send_success(res, 201, null, "Deploy Added to Queue !");
  } catch {
    return send_error(
      res,
      500,
      "Service saved but deployment could not be queued",
    );
  }
}

export async function ServicesActions(req: Request, res: Response) {
  const userId = req.user!.id;

  const parsed = ActionServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return send_error(
      res,
      400,
      parsed.error.issues[0]?.message ?? "Fill All required Fields",
    );
  }

  const { ids, action } = parsed.data;
  const owned = and(inArray(services.id, ids), eq(services.user_id, userId));

  const target_status =
    action === "suspend"
      ? [DEPLOYMENT_STATUS.RUNNING]
      : action === "resume"
        ? [DEPLOYMENT_STATUS.SUSPENDED]
        : [DEPLOYMENT_STATUS.RUNNING, DEPLOYMENT_STATUS.SUSPENDED];

  const containers = await db
    .select({
      id: deployments.id,
      service_id: deployments.service_id,
      container_name: deployments.container_name,
    })
    .from(deployments)
    .innerJoin(services, eq(services.id, deployments.service_id))
    .where(
      and(
        owned,
        isNotNull(deployments.container_name),
        inArray(deployments.status, target_status),
      ),
    );

  if (action !== "delete" && containers.length === 0) {
    return send_error(res, 400, `No Services to ${action} !`);
  }

  await Promise.all(
    containers.map((item) =>
      EnqueueDeploymentActions(
        item.id,
        item.service_id,
        action,
        item.container_name!,
      ),
    ),
  );

  if (action === "delete") {
    const deleted = await db.delete(services).where(owned).returning();
    if (deleted.length === 0) {
      return send_error(res, 400, "No Services have been Deleted !");
    }
    return send_success(
      res,
      200,
      null,
      `${deleted.length} service(s) deleted successfully !`,
    );
  }

  const updated = await db
    .update(services)
    .set({ enabled: action === "resume", updated_on: new Date() })
    .where(owned)
    .returning();

  return send_success(
    res,
    200,
    null,
    `${updated.length} service(s) ${action === "resume" ? "resumed" : "suspended"} successfully !`,
  );
}
