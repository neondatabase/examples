import { integer, pgTable } from "drizzle-orm/pg-core";

export const counters = pgTable("counters", {
  id: integer("id").primaryKey(),
  value: integer("value").notNull().default(0),
});
