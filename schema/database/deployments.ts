import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./user.js";
import { projects } from "./project.js";
import { services } from "./services.js";
import { DEPLOY_TRIGGER, DEPLOYMENT_STATUS } from "../../constants.js";

type DeploymentLogLine = {
  ts: number;
  stream: "stdout" | "stderr" | "system";
  line: string;
};

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    service_id: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),

    status: integer("status").notNull().default(DEPLOYMENT_STATUS.QUEUED),

    trigger: integer("trigger").default(DEPLOY_TRIGGER.AUTO),
    deploy_type: integer("deploy_type").notNull(),
    commit_sha: text("commit_sha"),
    image_tag: text("image_tag"),
    container_name: text("container_name"),

    logs: jsonb("logs").$type<DeploymentLogLine[]>(),
    error: text("error"),

    created_on: timestamp("created_on", { withTimezone: true })
      .defaultNow()
      .notNull(),
    started_on: timestamp("started_on", { withTimezone: true }),
    finished_on: timestamp("finished_on", { withTimezone: true }),
  },
  function (table) {
    return [
      index("deployments_service_id_idx").on(
        table.service_id,
        table.created_on,
      ),
    ];
  },
);
