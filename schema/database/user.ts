import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("provider", ["app", "github"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  provider: providerEnum("provider").default("app").notNull(),
  github_id: text("github_id").unique(),
  github_token: text("github_token"),
  created_on: timestamp("created_on").defaultNow().notNull(),
});
