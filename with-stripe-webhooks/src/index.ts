import { type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import Stripe from "stripe";
import { getDb } from "./db/client.js";
import { customers, stripeEvents, subscriptions } from "./db/schema.js";
import { getStripeWebhookSecret } from "./env.js";

const db = getDb();
const webhookSecret = getStripeWebhookSecret();

type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

const app = new Hono();

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "stripe-webhooks",
    endpoints: {
      webhook: "POST /webhooks/stripe",
    },
  }),
);

app.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "missing stripe-signature header" }, 400);
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    console.error("Webhook signature verification failed:", message);
    return c.json({ error: "invalid signature" }, 400);
  }

  // Claim the event in the database and process it in a transaction. If the event has already been claimed, we skip processing it.
  try {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(stripeEvents)
        .values({
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          payload: event,
          createdAt: new Date(event.created * 1000),
        })
        .onConflictDoNothing({ target: stripeEvents.id })
        .returning({ id: stripeEvents.id });

      if (!claimed) {
        return { duplicate: true as const };
      }

      await handleStripeEvent(tx, event);
      return { duplicate: false as const };
    });

    return c.json({ received: true, duplicate: result.duplicate });
  } catch (err) {
    console.error(`Failed to process ${event.type} (${event.id}):`, err);
    return c.json({ error: "processing failed" }, 500);
  }
});

async function handleStripeEvent(tx: Db, event: Stripe.Event): Promise<void> {
  const eventAt = new Date(event.created * 1000);

  switch (event.type) {
    case "customer.created":
    case "customer.updated":
      await upsertCustomer(tx, event.data.object, eventAt);
      break;

    case "customer.deleted":
      await upsertCustomer(tx, event.data.object, eventAt);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(tx, event.data.object, eventAt);
      break;

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;
      if (customerId) {
        await ensureCustomer(tx, customerId, session.customer_details?.email ?? null, eventAt);
      }
      break;
    }

    default:
      break;
  }
}

// A helper to ensure that we only update a row if the event is newer than the last event we've seen for that row. This prevents out-of-order events from overwriting newer data.
function notOlderThan(column: SQL.Aliased | unknown, eventAt: Date): SQL {
  return sql`${column} IS NULL OR ${column} <= ${eventAt}`;
}

async function upsertCustomer(
  tx: Db,
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  eventAt: Date,
): Promise<void> {
  if ("deleted" in customer && customer.deleted) {
    await tx
      .insert(customers)
      .values({
        id: customer.id,
        email: null,
        name: null,
        lastStripeEventAt: eventAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          email: null,
          name: null,
          lastStripeEventAt: eventAt,
          updatedAt: new Date(),
        },
        setWhere: notOlderThan(customers.lastStripeEventAt, eventAt),
      });
    return;
  }

  const full = customer as Stripe.Customer;
  await tx
    .insert(customers)
    .values({
      id: full.id,
      email: full.email ?? null,
      name: full.name ?? null,
      lastStripeEventAt: eventAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: customers.id,
      set: {
        email: full.email ?? null,
        name: full.name ?? null,
        lastStripeEventAt: eventAt,
        updatedAt: new Date(),
      },
      setWhere: notOlderThan(customers.lastStripeEventAt, eventAt),
    });
}

// Ensure that a customer exists in the database. If the customer already exists, we update the email if provided. This is used for events that reference a customer but don't provide full customer details, like subscription events.
async function ensureCustomer(
  tx: Db,
  customerId: string,
  email: string | null,
  eventAt: Date,
): Promise<void> {
  await tx
    .insert(customers)
    .values({
      id: customerId,
      email,
      name: null,
      lastStripeEventAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: customers.id,
      set: {
        ...(email ? { email } : {}),
        updatedAt: new Date(),
      },
      setWhere: notOlderThan(customers.lastStripeEventAt, eventAt),
    });
}

function primaryPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  if (!item) return null;
  return typeof item.price === "string" ? item.price : (item.price?.id ?? null);
}

function currentPeriodEnd(sub: Stripe.Subscription): Date | null {
  const fromSub = (sub as Stripe.Subscription & { current_period_end?: number })
    .current_period_end;
  const fromItem = (
    sub.items?.data?.[0] as Stripe.SubscriptionItem & { current_period_end?: number } | undefined
  )?.current_period_end;
  const end = fromSub ?? fromItem;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

async function upsertSubscription(
  tx: Db,
  sub: Stripe.Subscription,
  eventAt: Date,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await ensureCustomer(tx, customerId, null, eventAt);

  await tx
    .insert(subscriptions)
    .values({
      id: sub.id,
      customerId,
      status: sub.status,
      priceId: primaryPriceId(sub),
      currentPeriodEnd: currentPeriodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      lastStripeEventAt: eventAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        customerId,
        status: sub.status,
        priceId: primaryPriceId(sub),
        currentPeriodEnd: currentPeriodEnd(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        lastStripeEventAt: eventAt,
        updatedAt: new Date(),
      },
      setWhere: notOlderThan(subscriptions.lastStripeEventAt, eventAt),
    });
}

export default app;
