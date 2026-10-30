// Checks the deployed rollup answers: /health (database and schema), then an
// authenticated read of the daily totals, which proves the key without writing.
// Retries while a new deployment is still rolling out.

export async function smokeTest(
  baseUrl: string,
  apiKey: string,
  { timeoutMs = 180_000, intervalMs = 5_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  for (;;) {
    try {
      const health = await fetch(new URL("/health", baseUrl), {
        signal: AbortSignal.timeout(10_000),
      });
      if (health.ok) {
        const totals = await fetch(new URL("/v1/daily-totals?days=1", baseUrl), {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (totals.ok) {
          console.log(`Rollup is answering at ${new URL(baseUrl).origin}`);
          return;
        }
        last = `daily totals answered ${totals.status}`;
      } else {
        last = `/health answered ${health.status}`;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline)
      throw new Error(`The rollup didn't answer in time (${last})`);
    await new Promise((done) => setTimeout(done, intervalMs));
  }
}
