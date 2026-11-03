import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_name: text("project_name").notNull(),
  environment: text("environment").notNull(),
  created_on: timestamp("created_on").defaultNow().notNull(),
  updated_on: timestamp("updated_on").defaultNow().notNull(),
});
