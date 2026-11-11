import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.DEMO_URL ?? "http://localhost:3001",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
});
