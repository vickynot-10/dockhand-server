import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { projects } from "../schema/database/project.js";
import { and, eq, sql } from "drizzle-orm";
import { services } from "../schema/database/services.js";
import { SaveServiceSchema } from "../schema/zod/services.schema.js";
import { DEPLOY_TYPE } from "../constants.js";
import { CreateService } from "../service/service.service.js";

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

  const insert = await CreateService(userId, parsed.data);

  if (!insert) {
    return send_error(res, 400, "Failed to Insert !");
  }

  return send_success(res, 201, null);
}
