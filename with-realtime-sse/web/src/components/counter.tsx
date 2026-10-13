import { useEffect, useState } from 'react';

const FUNCTION_URL = import.meta.env.VITE_FUNCTION_URL ?? 'http://localhost:8787';

export function Counter() {
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // EventSource reconnects on its own when the function isolate is evicted or
    // the network drops, so there's no manual backoff to write here.
    const source = new EventSource(`${FUNCTION_URL}/events`);
    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      const value = Number(event.data);
      if (Number.isFinite(value)) setCount(value);
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  async function increment() {
    setBusy(true);
    try {
      // The updated value comes back over SSE (to every client), so we don't
      // set local state from the response.
      await fetch(`${FUNCTION_URL}/increment`, { method: 'POST' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <div className="card">
        <span className={`status ${connected ? 'status--on' : 'status--off'}`}>
          {connected ? 'live' : 'connecting…'}
        </span>
        <h1>Neon realtime counter</h1>
        <p className="count">{count ?? '—'}</p>
        <button onClick={increment} disabled={busy}>
          Increment
        </button>
        <p className="hint">
          Open this page in another tab or browser — every click updates them all
          over server-sent events.
        </p>
      </div>
    </main>
  );
}
