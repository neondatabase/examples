import { Hono } from 'hono';
import Stripe from 'stripe';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { customers, stripeEvents, subscriptions } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const { STRIPE_WEBHOOK_SECRET } = parseEnv(config, 'stripe').function;
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

const app = new Hono();

app.get('/', (c) => c.text('Neon Stripe webhooks. POST /webhooks/stripe'));

app.post('/webhooks/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'missing stripe-signature header' }, 400);

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(await c.req.text(), signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    // The error carries the payload, so log only its message to keep customer data out of logs.
    const message = error instanceof Error ? error.message : String(error);
    console.error('Webhook signature verification failed:', message);
    return c.json({ error: 'invalid signature' }, 400);
  }

  // Stripe retries deliveries, so each event is claimed once by its id before it is handled.
  try {
    const duplicate = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(stripeEvents)
        .values({
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          payload: event,
          createdAt: new Date(event.created * 1000),
        })
        .onConflictDoNothing()
        .returning();
      if (!claimed) return true;
      await handleEvent(tx, event);
      return false;
    });
    return c.json({ received: true, duplicate });
  } catch (error) {
    console.error(`Failed to process ${event.type} (${event.id}):`, error);
    return c.json({ error: 'processing failed' }, 500);
  }
});

async function handleEvent(tx: Tx, event: Stripe.Event) {
  const eventAt = new Date(event.created * 1000);

  switch (event.type) {
    case 'customer.created':
    case 'customer.updated':
      return saveCustomer(tx, event.data.object.id, eventAt, {
        email: event.data.object.email,
        name: event.data.object.name ?? null,
      });

    case 'customer.deleted':
      // Keep the row, since subscriptions reference it, but remove the personal data.
      return saveCustomer(tx, event.data.object.id, eventAt, { email: null, name: null });

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return saveSubscription(tx, event.data.object, eventAt);

    case 'checkout.session.completed': {
      const { customer, customer_details } = event.data.object;
      const customerId = typeof customer === 'string' ? customer : customer?.id;
      if (customerId) {
        await ensureCustomer(tx, customerId, eventAt, customer_details?.email ?? null);
      }
      return;
    }
  }
}

// Stripe can deliver events out of order, so a row only changes for an event at least as new.
const notOlderThan = (column: PgColumn, eventAt: Date) =>
  sql`${column} IS NULL OR ${column} <= ${eventAt}`;

async function saveCustomer(
  tx: Tx,
  id: string,
  eventAt: Date,
  fields: { email: string | null; name: string | null },
) {
  const values = { ...fields, lastStripeEventAt: eventAt, updatedAt: new Date() };
  await tx
    .insert(customers)
    .values({ id, ...values })
    .onConflictDoUpdate({
      target: customers.id,
      set: values,
      setWhere: notOlderThan(customers.lastStripeEventAt, eventAt),
    });
}

// For events that reference a customer without the full customer object.
async function ensureCustomer(tx: Tx, id: string, eventAt: Date, email: string | null = null) {
  await tx
    .insert(customers)
    .values({ id, email })
    .onConflictDoUpdate({
      target: customers.id,
      set: email ? { email, updatedAt: new Date() } : { updatedAt: new Date() },
      setWhere: notOlderThan(customers.lastStripeEventAt, eventAt),
    });
}

// Endpoints on Stripe API versions before 2025-03-31 send the period end on the subscription.
function currentPeriodEnd(subscription: Stripe.Subscription) {
  const legacy = 'current_period_end' in subscription ? subscription.current_period_end : undefined;
  const end = subscription.items.data[0]?.current_period_end ?? legacy;
  return typeof end === 'number' ? new Date(end * 1000) : null;
}

async function saveSubscription(tx: Tx, subscription: Stripe.Subscription, eventAt: Date) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  await ensureCustomer(tx, customerId, eventAt);

  const item = subscription.items.data[0];
  const values = {
    customerId,
    status: subscription.status,
    priceId: item?.price.id ?? null,
    currentPeriodEnd: currentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    lastStripeEventAt: eventAt,
    updatedAt: new Date(),
  };
  await tx
    .insert(subscriptions)
    .values({ id: subscription.id, ...values })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: values,
      setWhere: notOlderThan(subscriptions.lastStripeEventAt, eventAt),
    });
}

export default app;
