import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("startup failure explains how to retry", async ({ page, baseURL }) => {
  test.skip(
    process.env.DEMO_SSR === "1",
    "SSR pages authorize their initial queries on the server.",
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/todos/live", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto(baseURL);
  await expect(page.locator(".error")).toHaveText(
    "Could not load todos. Reload to retry.",
  );
  await page.unroute("**/api/todos/live");
  await page.reload();
  await expect(page.locator("output")).toHaveText("live");
  expect(errors).toEqual([]);
});

for (const failure of ["network", "server"]) {
  test(`${failure} mutation failure preserves input and shows an error`, async ({
    page,
    baseURL,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL);
    await expect(page.locator("output")).toHaveText(/^(live|ready)$/);
    let failedRequests = 0;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.method() !== "POST" ||
        new URL(request.url()).origin !== new URL(baseURL).origin
      ) {
        return route.continue();
      }
      failedRequests++;
      if (failure === "network") return route.abort("failed");
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service unavailable" }),
      });
    });

    const title = `Unsaved todo ${randomUUID()}`;
    const input = page.locator('input[name="title"]');
    await input.fill(title);
    await page.getByRole("button", { name: "Add todo", exact: true }).click();
    await expect(page.locator(".error")).toBeVisible();
    await expect(input).toHaveValue(title);
    await expect(page.locator("li").filter({ hasText: title })).toHaveCount(0);
    expect(failedRequests).toBe(1);
    expect(errors).toEqual([]);
  });
}
