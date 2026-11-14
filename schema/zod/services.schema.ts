import { z } from "zod";
import { DEPLOY_TYPE, GITHUB_REPO_TYPE, RUNTIMES } from "../../constants.js";
import { IsValidSlug } from "../../utils/domain.js";

const base_fields = {
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty")
    .max(64, "Name is too long"),

  slug: z
    .string({ error: "Subdomain is required" })
    .trim()
    .toLowerCase()
    .min(3, "Subdomain must be at least 3 characters")
    .max(40, "Subdomain is too long")
    .refine(IsValidSlug, {
      message:
        "Use lowercase letters, numbers and hyphens only, and not a reserved name",
    }),

  project_id: z
    .string({ error: "ID is required" })
    .trim()
    .min(1, "ID cannot be empty"),
  type: z
    .string({ error: "Type is required" })
    .trim()
    .min(1, "Type cannot be empty"),

  port: z.coerce
    .number({ error: "PORT is Requried" })
    .int("Port must be an integer")
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535"),
};

const env_var_schema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Invalid variable name"),
  value: z.string(),
});

const github_fields = {
  deploy_type: z.literal(DEPLOY_TYPE.GITHUB),
  repo_id: z.number().int().positive().nullable().default(null),
  repo_full_name: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Invalid repository"),
  branch: z.string().trim().min(1, "Branch is required"),
  repo_type: z.coerce
    .number()
    .refine(
      (v) => Object.values(GITHUB_REPO_TYPE).includes(v as 1 | 2),
      "Invalid repository type",
    ),
  root_directory: z
    .string()
    .trim()
    .min(1, "Root directory is required")
    .refine((v) => !v.split("/").includes(".."), "Invalid root directory"),
  use_dockerfile: z.boolean().default(false),
  build_command: z.string().trim().default(""),
  runtime: z.coerce.number().int().default(RUNTIMES.NODE),
  start_command: z.string().trim().default(""),
  output_directory: z.string().trim().default(""),

  auto_deploy: z.boolean().default(true),

  env_vars: z.array(env_var_schema).superRefine(function (vars, ctx) {
    const seen = new Set<string>();
    vars.forEach(function (v, index) {
      if (seen.has(v.key)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate variable name",
          path: [index, "key"],
        });
      }
      seen.add(v.key);
    });
  }),
};

const docker_fields = {
  deploy_type: z.literal(DEPLOY_TYPE.DOCKER),
  image_url: z
    .string({ error: "Image URL is required" })
    .trim()
    .min(1, "Image URL is required")
    .regex(/^\S+$/, "Image URL cannot contain spaces"),
};

const service_id_field = {
  service_id: z.string({ error: "ID is required" }).uuid("Invalid service ID"),
};

function checkGithubFields(
  data: {
    type: string;
    repo_type: number;
    repo_id: number | null;
    use_dockerfile: boolean;
    build_command: string;
    runtime: number;
    start_command: string;
    output_directory: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.repo_type === GITHUB_REPO_TYPE.PRIVATE && !data.repo_id) {
    ctx.addIssue({
      code: "custom",
      message: "Repository is required",
      path: ["repo_id"],
    });
  }

  if (data.use_dockerfile) return;

  if (!data.build_command) {
    ctx.addIssue({
      code: "custom",
      message: "Build command is required",
      path: ["build_command"],
    });
  }

  if (data.type === "web") {
    if (!Object.values(RUNTIMES).some((runtime) => runtime === data.runtime)) {
      ctx.addIssue({
        code: "custom",
        message: "Runtime is required",
        path: ["runtime"],
      });
    }
    if (!data.start_command) {
      ctx.addIssue({
        code: "custom",
        message: "Start command is required",
        path: ["start_command"],
      });
    }
  }

  if (data.type === "static" && !data.output_directory) {
    ctx.addIssue({
      code: "custom",
      message: "Output directory is required",
      path: ["output_directory"],
    });
  }
}

const github_schema = z
  .object({ ...base_fields, ...github_fields })
  .superRefine(checkGithubFields);

const github_edit_schema = z
  .object({ ...service_id_field, ...base_fields, ...github_fields })
  .superRefine(checkGithubFields);

export const EditServiceSchema = z.discriminatedUnion("deploy_type", [
  github_edit_schema,
  z.object({ ...service_id_field, ...base_fields, ...docker_fields }),
]);

const docker_schema = z.object({ ...base_fields, ...docker_fields });

export const SaveServiceSchema = z.discriminatedUnion("deploy_type", [
  github_schema,
  docker_schema,
]);

export type SaveServiceInput = z.infer<typeof SaveServiceSchema>;
export type EditServiceInput = z.infer<typeof EditServiceSchema>;

export const ActionServiceSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(["suspend", "delete", "resume"]),
});
