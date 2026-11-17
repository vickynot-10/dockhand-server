import type { Request, Response } from "express";
import { CreateEditProjectSchema } from "../schema/zod/project.schema.js";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { projects } from "../schema/database/project.js";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { services } from "../schema/database/services.js";
import { deployments } from "../schema/database/deployments.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { EnqueueDeploymentActions } from "../queue/container-actions.queue.js";
import { removeServiceWebhooks } from "../webhooks/github.webhook.js";

export async function GetProjects(req: Request, res: Response) {
  const userId = req.user!.id;

  const rows = await db
    .select({
      project_name: projects.project_name,
      environment: projects.environment,
      updated_on: projects.updated_on,
      services_count: count(services.id),
      id: projects.id,
    })
    .from(projects)
    .where(eq(projects.user_id, userId))
    .leftJoin(
      services,
      and(eq(services.user_id, userId), eq(services.project_id, projects.id)),
    )
    .groupBy(projects.id)
    .orderBy(desc(projects.updated_on));

  return send_success(res, 200, rows);
}

export async function GetProjectsServices(req: Request, res: Response) {
  const userId = req.user!.id;

  const id: string | undefined = req.query!.id as string | undefined;

  if (!id) {
    return send_error(res, 400, "Invalid Payload !");
  }

  const [rows] = await db
    .select({
      id: projects.id,
      project_name: projects.project_name,
      environment: projects.environment,
      updated_on: projects.updated_on,

      services: sql`
      COALESCE(
        jsonb_agg(
          json_build_object(
          
            'id', ${services.id},
            'service_name' , ${services.name},
            'deploy_type' , ${services.deploy_type},
            'type' , ${services.type},
            'enabled' , ${services.enabled},
            'updated_on', ${services.updated_on},
            'host' , ${services.host}
          )
             ORDER BY ${services.updated_on} DESC
        ) FILTER (WHERE ${services.id} IS NOT NULL),
        '[]'::jsonb
      )
    `,
    })
    .from(projects)
    .leftJoin(
      services,
      and(eq(services.project_id, projects.id), eq(services.user_id, userId)),
    )
    .where(and(eq(projects.id, id), eq(projects.user_id, userId)))
    .groupBy(projects.id);

  return send_success(res, 200, rows);
}

export async function AddOrEditProject(req: Request, res: Response) {
  const result = CreateEditProjectSchema.safeParse(req.body);
  if (!result.success) {
    return send_error(res, 400, result.error.issues[0]?.message);
  }

  const { environment, project_name, id } = result.data;
  const userId = req.user!.id;

  if (id) {
    const [update] = await db
      .update(projects)
      .set({
        project_name,
        environment,
        updated_on: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.user_id, userId)))
      .returning();

    if (!update) {
      return send_error(res, 404, "Project not found !");
    }

    return send_success(res, 200, null, "Project Updated Successfully !");
  }

  const [create] = await db
    .insert(projects)
    .values({ project_name, environment, user_id: userId })
    .returning();

  if (!create) {
    return send_error(res, 500, "Internal Server Error !");
  }

  return send_success(res, 201, null, "Project Created Successfully !");
}

export async function DeleteProject(req: Request, res: Response) {
  const id = req.params.id as string | undefined;

  if (!id) {
    return send_error(res, 400, "Invalid Project");
  }
  const user_id = req.user!.id;

  const owned = and(eq(services.project_id, id), eq(services.user_id, user_id));

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
        inArray(deployments.status, [
          DEPLOYMENT_STATUS.RUNNING,
          DEPLOYMENT_STATUS.SUSPENDED,
        ]),
      ),
    );

  const hooks = await db
    .select({
      repo_full_name: services.repo_full_name,
      webhook_id: services.webhook_id,
    })
    .from(services)
    .where(and(owned, isNotNull(services.webhook_id)));

  await Promise.all(
    containers.map((item) =>
      EnqueueDeploymentActions(
        item.id,
        item.service_id,
        "delete",
        item.container_name!,
      ),
    ),
  );

  const [delete_project] = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.user_id, user_id)))
    .returning();

  if (!delete_project) {
    return send_error(res, 404, "Project not found !");
  }

  await removeServiceWebhooks(user_id, hooks);

  return send_success(res, 200, null, "Project Deleted Successfully !");
}
