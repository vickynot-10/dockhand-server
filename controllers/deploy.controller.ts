import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { deployments } from "../schema/database/deployments.js";

import { deployment_logs } from "../schema/database/deploy-logs.js";

export async function GetDeployMentlogs(req: Request, res: Response) {
  const id: string | undefined = req.query!.id;

  if (!id) {
    return send_error(res, 400, "Invalid Payload !");
  }

  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .leftJoin(deployment_logs, eq(deployment_logs.deployment_id, id));

  return send_success(res, 200, rows);
}
