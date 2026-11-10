import type Stripe from "stripe";
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  livemode: boolean("livemode").notNull().default(false),
  payload: jsonb("payload").$type<Stripe.Event>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  lastStripeEventAt: timestamp("last_stripe_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    status: text("status").notNull(),
    priceId: text("price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    lastStripeEventAt: timestamp("last_stripe_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("subscriptions_customer_id_idx").on(t.customerId)],
);
