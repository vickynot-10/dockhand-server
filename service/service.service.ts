import { db } from "../config/db.js";
import { services } from "../schema/database/services.js";
import type { SaveServiceInput } from "../schema/zod/services.schema.js";
import { DEPLOY_TYPE } from "../constants.js";

export async function createService(userId: string, data: SaveServiceInput) {
  const values =
    data.deploy_type === DEPLOY_TYPE.GITHUB
      ? {
          user_id: userId,
          project_id: data.project_id,
          type: data.type,
          name: data.name,
          deploy_type: data.deploy_type,

          repo_id: data.repo_id,
          repo_full_name: data.repo_full_name,
          branch: data.branch,
          root_directory: data.root_directory,
          build_command: data.build_command,
          output_directory: data.output_directory,
          env_vars: data.env_vars,

          image_url: null,
        }
      : {
          user_id: userId,
          project_id: data.project_id,
          type: data.type,
          name: data.name,
          deploy_type: data.deploy_type,

          repo_id: null,
          repo_full_name: null,
          branch: null,
          root_directory: null,
          build_command: null,
          output_directory: null,
          env_vars: null,

          image_url: data.image_url,
        };

  const [service] = await db.insert(services).values(values).returning();

  return service;
}
