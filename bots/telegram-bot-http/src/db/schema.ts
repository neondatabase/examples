import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const commandUsage = pgTable(
  "command_usage",
  {
    userId: text("user_id").notNull(),
    commandName: text("command_name").notNull(),
    runCount: integer("run_count").default(0).notNull(),
    lastRunAt: timestamp("last_run_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.commandName] })],
);
