import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  SQL,
  sql,
} from "drizzle-orm";

import { LogsQuerySchema } from "../schema/zod/logs.schema.js";
import { serviceLogs } from "../schema/database/service-logs.js";
import { services } from "../schema/database/services.js";

export async function GetApplicationlogs(req: Request, res: Response) {
  const userId = req.user!.id;

  const parsed = LogsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return send_error(
      res,
      400,
      parsed.error.issues[0]?.message ?? "Invalid Data !",
    );
  }

  const { limit, search, service_id, before } = parsed.data;

  const rows = await db
    .select()
    .from(serviceLogs)
    .leftJoin(
      services,
      and(
        eq(services.id, serviceLogs.service_id),
        eq(services.user_id, serviceLogs.user_id),
      ),
    );

  return send_success(res, 200, rows);
}
