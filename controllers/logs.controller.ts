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
}
