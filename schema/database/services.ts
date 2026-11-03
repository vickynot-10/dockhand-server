import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
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
  created_on: timestamp("created_on").defaultNow().notNull(),
  updated_on: timestamp("updated_on").defaultNow().notNull(),
});
