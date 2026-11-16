import { z } from "zod";

export const MetricsQuerySchema = z.object({
  service_id: z.string().uuid("Invalid service").optional(),
});
