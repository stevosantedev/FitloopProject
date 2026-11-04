import { defineConfig, devices } from "@playwright/test";

// Run the browser suite against the real Vite application. API responses are
// mocked in each test so these checks focus on user-visible frontend behaviour.
export default defineConfig({
  testDir: "./frontend/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  webServer: {
    command: "npm run dev --workspace frontend -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
