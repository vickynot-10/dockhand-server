import type { Request, Response } from "express";
import { CreateEditProjectSchema } from "../schema/zod/project.schema.js";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { projects } from "../schema/database/project.js";
import { and, eq } from "drizzle-orm";

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

    return send_success(res, 200, update, "Project Updated Successfully !");
  }

  const [create] = await db
    .insert(projects)
    .values({ project_name, environment, user_id: userId })
    .returning();

  if (!create) {
    return send_error(res, 500, "Internal Server Error !");
  }

  return send_success(res, 201, create, "Project Created Successfully !");
}
