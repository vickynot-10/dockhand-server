import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { and, desc, eq, ilike, lt, SQL } from "drizzle-orm";

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

  const conditions: SQL[] = [eq(serviceLogs.user_id, userId)];

  if (service_id) conditions.push(eq(serviceLogs.service_id, service_id));
  if (search) conditions.push(ilike(serviceLogs.message, `%${search}%`));
  if (before) conditions.push(lt(serviceLogs.id, before));

  const rows = await db
    .select({
      log_id: serviceLogs.id,
      service_id: serviceLogs.service_id,
      ts: serviceLogs.ts,
      message: serviceLogs.message,
      stream: serviceLogs.stream,
      service_name: services.name,
    })
    .from(serviceLogs)
    .innerJoin(services, eq(services.id, serviceLogs.service_id))
    .where(and(...conditions))
    .orderBy(desc(serviceLogs.id))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const page = has_more ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];

  return send_success(res, 200, {
    rows: page,
    has_more,
    next_cursor: has_more && oldest ? String(oldest.log_id) : null,
  });
}
