// Checks the deployed function answers: /health (database and schema), then an
// authenticated /v1/check, which proves the key and reaches the bucket and the
// AI model without paying for inference.
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
        const check = await fetch(new URL("/v1/check", baseUrl), {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (check.ok) {
          console.log(`Image insights is answering at ${new URL(baseUrl).origin}`);
          return;
        }
        last = `check answered ${check.status}`;
      } else {
        last = `/health answered ${health.status}`;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline)
      throw new Error(`Image insights didn't answer in time (${last})`);
    await new Promise((done) => setTimeout(done, intervalMs));
  }
}
