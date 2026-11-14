import { z } from "zod";

export const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(10).max(1000).default(200),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  service_id: z.string().uuid("Invalid service").optional(),
  before: z.coerce.date().optional(),
});

export type LogsQueryInput = z.infer<typeof LogsQuerySchema>;
