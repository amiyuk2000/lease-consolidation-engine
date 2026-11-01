import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A fresh throwaway local database each run, so end-to-end runs never touch real data.
    command: `node -e "require('fs').rmSync('.pglite-e2e',{recursive:true,force:true})" && npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: "./.pglite-e2e" },
  },
});
