import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { and, eq, getTableColumns, inArray, isNotNull, sql } from "drizzle-orm";

import { deployments } from "../schema/database/deployments.js";

import { deployment_logs } from "../schema/database/deploy-logs.js";
import { services } from "../schema/database/services.js";

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

  const [rows] = await db
    .select({
      service: serviceColumns,

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
    .groupBy(services.id);

  if (!rows) {
    return send_error(res, 404, "Deployment not found!");
  }

  return send_success(res, 200, rows);
}
