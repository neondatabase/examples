// Checks the deployed queue answers: /health (database and schema), then an
// authenticated claim on an empty queue, which proves the key without writing
// a job. Retries while a new deployment is still rolling out.

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
        const claim = await fetch(new URL("/v1/jobs/claim", baseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ queue: "smoke-test", batch_size: 1 }),
          signal: AbortSignal.timeout(10_000),
        });
        if (claim.ok) {
          console.log(`Queue is answering at ${new URL(baseUrl).origin}`);
          return;
        }
        last = `claim answered ${claim.status}`;
      } else {
        last = `/health answered ${health.status}`;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline)
      throw new Error(`The queue didn't answer in time (${last})`);
    await new Promise((done) => setTimeout(done, intervalMs));
  }
}
