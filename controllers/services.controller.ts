import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { services } from "../schema/database/services.js";
import { SaveServiceSchema } from "../schema/zod/services.schema.js";
import { CreateService } from "../service/service.service.js";

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

  try {
    const insert = await CreateService(userId, data);

    if (!insert) {
      return send_error(res, 400, "Failed to Insert !");
    }

    return send_success(res, 201, null);
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
}
