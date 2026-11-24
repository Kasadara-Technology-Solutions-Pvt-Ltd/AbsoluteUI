import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Angular adapter tests: `ngc -p packages/angular/tsconfig.test.json` compiles the
// adapter and its tests ahead of time (full compilation, strict templates) into
// .cache/angular-test; they run here in real Chromium against the BUILT
// @absoluteui/* packages (resolved through package exports, like a consumer).
export default defineConfig({
  test: {
    include: ['.cache/angular-test/test/**/*.test.js'],
    // Vitest's default browser API port (63315) falls inside a range Windows can reserve for Hyper-V.
    api: { port: Number(process.env.VITEST_API_PORT ?? 45316) },
    browser: {
      enabled: true,
      // --expose-gc: the M6 retained-object checks force a collection (test/m6-bench.test.ts).
      provider: playwright({ launchOptions: { args: ['--js-flags=--expose-gc'] } }),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
