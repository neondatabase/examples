// From guides/subscribing.md "Renew the sealed query". Used by app.ts
import type {
  RawLiveQuerySubscription,
  SealedLiveQuery,
} from "@neon/realtime/client";

// The same timing the React and TanStack DB bindings use
const RENEW_EARLY_MS = 10_000;
const RETRY_MS = 1_000;

export function renewBeforeExpiry<Row>(
  subscription: RawLiveQuerySubscription<Row>,
  sealedQuery: SealedLiveQuery<Row>,
  fetchSealedQuery: () => Promise<SealedLiveQuery<Row>>,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function schedule(delay: number) {
    clearTimeout(timer);

    if (!stopped) {
      timer = setTimeout(renew, delay);
    }
  }

  function scheduleBeforeExpiry(expiresAt: number) {
    schedule(Math.max(0, expiresAt - Date.now() - RENEW_EARLY_MS));
  }

  async function renew() {
    let next: SealedLiveQuery<Row>;

    try {
      next = await fetchSealedQuery();
    } catch {
      schedule(RETRY_MS);
      return;
    }

    scheduleBeforeExpiry(next.expiresAt);

    // A rejected renewal means the subscription is in `error` or the query changed
    subscription.renew(next).catch(stop);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
  }

  scheduleBeforeExpiry(sealedQuery.expiresAt);

  return stop;
}
