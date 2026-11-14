import {
  pgTable,
  bigserial,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { services } from "./services.js";
import { deployments } from "./deployments.js";

export const serviceLogs = pgTable(
  "service_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    service_id: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    deployment_id: uuid("deployment_id").references(() => deployments.id, {
      onDelete: "set null",
    }),
    ts: timestamp("ts", { precision: 3 }).notNull(),
    stream: text("stream").notNull().default("stdout"),
    level: text("level"),
    message: text("message").notNull(),
  },
  (table) => [
    index("service_logs_service_ts_idx").on(table.service_id, table.ts),
    index("service_logs_service_level_idx").on(
      table.service_id,
      table.level,
      table.id,
    ),
  ],
);
