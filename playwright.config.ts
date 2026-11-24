import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Performance specs run in their own project after all functional tests (every engine), one
// at a time, so budgets are never measured while other workers load the machine.
const PERF = /perf.*\.spec\.ts$/;
// E2E_PORT lets parallel checkouts run the suite side by side (tests/e2e/serve.mjs reads it too).
const PORT = Number(process.env.E2E_PORT ?? 4317);
// The Theme Designer app (apps/theme-designer) runs as its own server during the suite.
const DESIGNER_PORT = Number(process.env.DESIGNER_E2E_PORT ?? 4332);
// The HRMS demo (apps/demo-hrms) runs against a disposable PostgreSQL database.
const DEMO_PORT = Number(process.env.DEMO_E2E_PORT ?? 4353);

const SERVERS = [
  {
    name: 'harness',
    server: {
      command: 'node tests/e2e/serve.mjs',
      url: `http://127.0.0.1:${String(PORT)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  },
  {
    name: 'demo',
    server: {
      command: 'node apps/demo-hrms/scripts/test-server.mjs',
      url: `http://127.0.0.1:${String(DEMO_PORT)}/`,
      env: { DEMO_E2E_PORT: String(DEMO_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  },
  {
    name: 'designer',
    server: {
      command: 'node apps/theme-designer/serve.mjs',
      url: `http://127.0.0.1:${String(DESIGNER_PORT)}/`,
      env: { DESIGNER_PORT: String(DESIGNER_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  },
];
// The public source snapshot has no HRMS demo (scripts/export-public.mjs): its server is started only when the app is present.
const HAS_DEMO = existsSync('apps/demo-hrms/scripts/test-server.mjs');
const ONLY = process.env.E2E_SERVERS ? new Set(process.env.E2E_SERVERS.split(',').map((s) => s.trim())) : null;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list'], ['./tests/e2e/evidence-reporter.ts']],
  // Baseline names are independent of the project (win32 suffix only), as in R0.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{-snapshotSuffix}{ext}',
  use: { baseURL: `http://127.0.0.1:${String(PORT)}`, ...devices['Desktop Chrome'] },
  projects: [
    { name: 'functional', testIgnore: PERF },
    { name: 'performance', testMatch: PERF, dependencies: ['functional', 'firefox', 'webkit'], fullyParallel: false, workers: 1 },
    // Browser support matrix (docs/browser-support.json, R15-1): the functional suite in Firefox and
    // WebKit. Screenshot baselines are Chromium renderings, so these projects skip snapshot comparisons.
    { name: 'firefox', testIgnore: PERF, use: { ...devices['Desktop Firefox'] }, ignoreSnapshots: true },
    { name: 'webkit', testIgnore: PERF, use: { ...devices['Desktop Safari'] }, ignoreSnapshots: true },
  ],
  // E2E_SERVERS (comma list of harness, demo, designer) starts only those servers, for focused runs side by side.
  webServer: SERVERS.filter((s) => (s.name !== 'demo' || HAS_DEMO) && (ONLY === null || ONLY.has(s.name))).map((s) => s.server),
});
