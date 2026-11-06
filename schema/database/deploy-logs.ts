import {
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { deployments } from "./deployments.js";

export const deployment_logs = pgTable(
  "deployment_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    deployment_id: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    stream: text("stream").notNull(),
    line: text("line").notNull(),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  },
  function (table) {
    return [
      index("deployment_logs_deployment_id_idx").on(
        table.deployment_id,
        table.id,
      ),
    ];
  },
);
