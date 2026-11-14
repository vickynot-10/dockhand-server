import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./user.js";
import { projects } from "./project.js";

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),

  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),

  port: integer("port").notNull().default(80),

  name: text("name").notNull(),

  slug: text("slug").notNull().unique(),
  host: text("host"),

  deploy_type: integer("deploy_type").notNull(),

  enabled: boolean("enabled").notNull().default(true),

  use_dockerfile: boolean("use_dockerfile").notNull().default(false),
  repo_id: integer("repo_id"),
  repo_type: integer("repo_type"),
  repo_full_name: text("repo_full_name"),
  branch: text("branch"),
  auto_deploy: boolean("auto_deploy").default(true),
  webhook_id: bigint("webhook_id", { mode: "number" }),
  webhook_secret: text("webhook_secret"),
  root_directory: text("root_directory"),
  build_command: text("build_command"),

  runtime: integer("runtime"),
  start_command: text("start_command"),

  output_directory: text("output_directory"),

  env_vars: jsonb("env_vars").$type<{ key: string; value: string }[]>(),

  image_url: text("image_url"),

  created_on: timestamp("created_on").defaultNow().notNull(),
  updated_on: timestamp("updated_on").defaultNow().notNull(),
});
