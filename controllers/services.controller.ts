import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { services } from "../schema/database/services.js";
import { SaveServiceSchema } from "../schema/zod/services.schema.js";
import { CreateService } from "../service/service.service.js";
import { DeployService } from "../service/deploy.service.js";

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
    const deployment = await DeployService({
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
