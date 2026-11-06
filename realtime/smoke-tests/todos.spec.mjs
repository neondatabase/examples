import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// Count lifecycle events without retaining or logging sealed queries.
function observeWebSockets() {
  const NativeWebSocket = window.WebSocket;
  window.__realtimeSmoke = { sockets: [], connections: 0, renewals: 0 };
  window.WebSocket = class extends NativeWebSocket {
    constructor(...args) {
      super(...args);
      const protocols = Array.isArray(args[1]) ? args[1] : [args[1]];
      // Leave framework development sockets alone during reconnect tests.
      if (protocols.includes("neon.realtime.v1")) {
        window.__realtimeSmoke.sockets.push(this);
        this.addEventListener(
          "open",
          () => window.__realtimeSmoke.connections++,
        );
      }
    }
    send(data) {
      if (typeof data === "string") {
        try {
          if (JSON.parse(data).type === "renew")
            window.__realtimeSmoke.renewals++;
        } catch {
          // Non-JSON frames are irrelevant to the renewal check.
        }
      }
      return super.send(data);
    }
  };
}

test("two tabs receive mutations, renew queries, and recover after reconnect", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  await first.addInitScript(observeWebSockets);
  await second.addInitScript(observeWebSockets);
  const a = await first.newPage();
  const b = await second.newPage();
  const errors = [];
  for (const page of [a, b]) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !/Failed to load resource|WebSocket connection to/.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
  }
  const title = `Realtime smoke ${randomUUID()} — Sam's "notes"`;
  const reconnectTitle = `${title} reconnect`;
  const row = (page, text = title) =>
    page.locator("li").filter({ has: page.getByText(text, { exact: true }) });
  const add = async (text) => {
    await a.locator('input[name="title"], input#title').fill(text);
    await a.getByRole("button", { name: "Add todo", exact: true }).click();
    await expect(row(a, text)).toBeVisible();
    await expect(a.locator('input[name="title"]')).toHaveValue("");
  };

  try {
    await Promise.all([a.goto(baseURL), b.goto(baseURL)]);
    const readyStatus =
      (await a.locator(".eyebrow").textContent()) === "TanStack Start + DB"
        ? "ready"
        : "live";
    for (const page of [a, b]) {
      if (process.env.DEMO_FRAMEWORK) {
        await expect(page.locator(".eyebrow")).toHaveText(
          process.env.DEMO_FRAMEWORK,
        );
      }
      await expect(page.locator("output")).toHaveText(readyStatus);
    }
    const liveSince = Date.now();

    await add(title);
    await expect(row(b)).toBeVisible();
    await row(a).locator(".toggle").click();
    for (const page of [a, b]) await expect(row(page)).toHaveClass("completed");
    await row(b).locator(".toggle").click();
    for (const page of [a, b]) await expect(row(page)).toHaveClass("active");

    if (process.env.DEMO_SSR === "1") {
      const ssr = await browser.newContext({ javaScriptEnabled: false });
      try {
        const page = await ssr.newPage();
        await page.goto(baseURL);
        await expect(row(page)).toBeVisible();
      } finally {
        await ssr.close();
      }
    }

    if (process.env.SMOKE_QUICK !== "1") {
      // Run beyond the original 60-second capability lifetime, then mutate.
      await expect
        .poll(() => Date.now() - liveSince, {
          timeout: 80_000,
          intervals: [1_000],
        })
        .toBeGreaterThan(65_000);
      for (const page of [a, b]) {
        await expect
          .poll(() => page.evaluate(() => window.__realtimeSmoke.renewals))
          .toBeGreaterThan(0);
        await expect(page.locator("output")).toHaveText(readyStatus);
      }
      await row(a).locator(".toggle").click();
      await expect(row(b)).toHaveClass("completed");

      const connections = await b.evaluate(
        () => window.__realtimeSmoke.connections,
      );
      await second.setOffline(true);
      // Browser offline mode alone does not reliably close existing sockets.
      await b.evaluate(() =>
        window.__realtimeSmoke.sockets.forEach((socket) => socket.close()),
      );
      await add(reconnectTitle);
      await second.setOffline(false);
      await expect
        .poll(() => b.evaluate(() => window.__realtimeSmoke.connections))
        .toBeGreaterThan(connections);
      await expect(row(b, reconnectTitle)).toBeVisible();
      await expect(b.locator("output")).toHaveText(readyStatus);
      await row(a, reconnectTitle)
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(row(b, reconnectTitle)).toHaveCount(0);
    }

    await row(a).getByRole("button", { name: "Delete", exact: true }).click();
    for (const page of [a, b]) await expect(row(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await second.setOffline(false).catch(() => {});
    // A failed stream may have saved a row without showing it. Reload before
    // cleanup in that case so the initial snapshot exposes the saved row.
    if (!a.isClosed() && test.info().status !== test.info().expectedStatus) {
      await a.reload({ timeout: 15_000 }).catch(() => {});
    }
    // Keep the seeded demo data; remove only rows created by this test.
    for (const text of a.isClosed() ? [] : [reconnectTitle, title]) {
      const item = row(a, text);
      if ((await item.count()) === 1) {
        await item
          .getByRole("button", { name: "Delete", exact: true })
          .click()
          .catch(() => {});
        await expect(item)
          .toHaveCount(0, { timeout: 5_000 })
          .catch(() => {});
      }
    }
    await first.close();
    await second.close();
  }
});
