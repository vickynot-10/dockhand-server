import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm";
import { services } from "../schema/database/services.js";
import {
  ActionServiceSchema,
  EditServiceSchema,
  SaveServiceSchema,
} from "../schema/zod/services.schema.js";
import { CreateService, UpdateService } from "../service/service.service.js";
import { DeployService } from "../service/deploy.service.js";
import { deployments } from "../schema/database/deployments.js";
import { DEPLOY_TRIGGER, DEPLOYMENT_STATUS } from "../constants.js";
import { EnqueueDeploymentActions } from "../queue/container-actions.queue.js";

function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function GetServiceByID(req: Request, res: Response) {
  const id: string | undefined = req.query!.id as string | undefined;

  if (!id) {
    return send_error(res, 400, "Invalid Payload !");
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

  const [rows] = await db
    .select({
      services: serviceColumns,
      deployments: sql`
      COALESCE(
        jsonb_agg(
          to_jsonb(${deployments}) - ARRAY['user_id', 'project_id', 'service_id', 'deploy_type']
          ORDER BY ${deployments.created_on} DESC
        ) FILTER (WHERE ${deployments.id} IS NOT NULL),
        '[]'::jsonb
      )
    `.as("deployments"),
    })
    .from(services)
    .leftJoin(deployments, eq(deployments.service_id, services.id))
    .where(eq(services.id, id))
    .groupBy(services.id);
  if (!rows) return send_error(res, 404, "Service not found!");
  return send_success(res, 200, rows);
}

export async function GetServiceByIDForEdit(req: Request, res: Response) {
  const id: string | undefined = req.query!.id as string | undefined;

  if (!id) {
    return send_error(res, 400, "Invalid Payload !");
  }

  const [rows] = await db.select().from(services).where(eq(services.id, id));

  if (!rows) return send_error(res, 404, "Service not found!");
  return send_success(res, 200, rows);
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
      trigger_type: DEPLOY_TRIGGER.AUTO,
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

export async function EditServices(req: Request, res: Response) {
  const userId = req.user!.id;

  const parsed = EditServiceSchema.safeParse(req.body);

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
    .where(and(eq(services.slug, data.slug), ne(services.id, data.service_id)));

  if (isSlugExists.length > 0) {
    return send_error(
      res,
      409,
      `A Subdomain with ${data.slug} already Exists !`,
    );
  }

  let service;

  try {
    service = await UpdateService(data);
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
    return send_error(res, 404, "Service not found !");
  }

  try {
    await DeployService({
      user_id: userId,
      project_id: service.project_id,
      service_id: service.id,
      deploy_type: service.deploy_type,
      trigger_type: DEPLOY_TRIGGER.AUTO,
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

export async function DeployServices(req: Request, res: Response) {
  const userId = req.user!.id;

  const { service_id } = req.body;

  if (!service_id) {
    return send_error(res, 400, "Invalid Payload !");
  }

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, service_id));

  if (!service) {
    return send_error(res, 400, "Service Not Found !");
  }
  if (!service.enabled) {
    return send_error(res, 400, "Resume the service before deploying");
  }

  const [inFlight] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(
      and(
        eq(deployments.service_id, service.id),
        inArray(deployments.status, [
          DEPLOYMENT_STATUS.QUEUED,
          DEPLOYMENT_STATUS.BUILDING,
        ]),
      ),
    );

  if (inFlight) {
    return send_error(res, 409, "A deployment is already in progress");
  }

  try {
    await DeployService({
      user_id: userId,
      project_id: service.project_id,
      service_id: service.id,
      deploy_type: service.deploy_type,
      trigger_type: DEPLOY_TRIGGER.MANUAL,
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
