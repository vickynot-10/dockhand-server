import { z } from "zod";
export const CreateEditProjectSchema = z.object({
  project_name: z
    .string({ error: "Project Name is required" })
    .trim()
    .min(1, "Project Name cannot be empty"),

  environment: z
    .string({ error: "Environment is required" })
    .trim()
    .min(1, "Environment cannot be empty"),

  id: z.string().nullable().optional(),
});
