import { z } from "zod";

export const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(10).max(1000).default(200),
  search: z.string().trim().optional(),
  service_id: z.string().uuid().optional(),
  before: z.coerce.number().int().positive().optional(),
});
