import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { projects } from "../schema/database/project.js";
import { and, eq, sql } from "drizzle-orm";
import { services } from "../schema/database/services.js";
import { SaveServiceSchema } from "../schema/zod/services.schema.js";
import { DEPLOY_TYPE } from "../constants.js";

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

  if (data.deploy_type === DEPLOY_TYPE.GITHUB) {
    const {
      project_id,
      type,
      name,
      repo_id,
      repo_full_name,
      branch,
      root_directory,
      build_command,
      output_directory,
      env_vars,
    } = data;
  } else if (data.deploy_type === DEPLOY_TYPE.DOCKER) {
    const { project_id, type, name, image_url } = data;

    // Docker deployment logic
  }

  return send_success(res, 201, null);
}
