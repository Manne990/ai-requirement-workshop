import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const telemetryDir = "test-results/mission-control-telemetry-e2e";
const e2eEnv = [
  "VITE_SUPABASE_URL=https://example-project.supabase.co",
  "VITE_SUPABASE_ANON_KEY=public-anon-key",
  "VITE_ALLOW_FRONTEND_AUTH_IN_PRODUCTION=true",
  "VITE_MISSION_CONTROL_TELEMETRY_ENDPOINT=/api/mission-control/telemetry",
  `AI_REQUIREMENT_WORKSHOP_TELEMETRY_DIR=${telemetryDir}`,
].join(" ");
const webServerCommand = process.env.CI
  ? `rm -rf ${telemetryDir} && ${e2eEnv} npm run build && ${e2eEnv} npm run preview -- --host 127.0.0.1 --port ${port}`
  : `${e2eEnv} npm run dev -- --host 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
