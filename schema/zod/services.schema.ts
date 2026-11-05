import { z } from "zod";
import { DEPLOY_TYPE } from "../../constants.js";

const RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "admin",
  "dashboard",
  "traefik",
  "mail",
  "dockhand",
];
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$/;

const base_fields = {
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty")
    .max(64, "Name is too long"),

  slug: z
    .string({ error: "Subdomain is required" })
    .trim()
    .regex(SLUG_REGEX, "3-30 chars, lowercase letters, numbers, hyphens only")
    .refine((v) => !RESERVED_SLUGS.includes(v), "This name is reserved"),

  project_id: z
    .string({ error: "ID is required" })
    .trim()
    .min(1, "ID cannot be empty"),
  type: z
    .string({ error: "Type is required" })
    .trim()
    .min(1, "Type cannot be empty"),
};

const env_var_schema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Invalid variable name"),
  value: z.string(),
});

const github_schema = z.object({
  ...base_fields,
  deploy_type: z.literal(DEPLOY_TYPE.GITHUB),
  repo_id: z
    .number({ error: "Repository is required" })
    .int()
    .positive("Repository is required"),
  repo_full_name: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Invalid repository"),
  branch: z.string().trim().min(1, "Branch is required"),
  root_directory: z
    .string()
    .trim()
    .min(1, "Root directory is required")
    .refine((v) => !v.split("/").includes(".."), "Invalid root directory"),
  build_command: z.string().trim().min(1, "Build command is required"),
  output_directory: z.string().trim().min(1, "Output directory is required"),
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
});

const docker_schema = z.object({
  ...base_fields,
  deploy_type: z.literal(DEPLOY_TYPE.DOCKER),

  image_url: z
    .string({ error: "Image URL is required" })
    .trim()
    .min(1, "Image URL is required")
    .regex(/^\S+$/, "Image URL cannot contain spaces"),
});

export const SaveServiceSchema = z.discriminatedUnion("deploy_type", [
  github_schema,
  docker_schema,
]);

export type SaveServiceInput = z.infer<typeof SaveServiceSchema>;
