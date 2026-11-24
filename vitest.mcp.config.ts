import { defineConfig } from 'vitest/config';

// @absoluteui/mcp runs in Node (stdio), not in a browser: its tests run in the Node environment
// (npm run test:mcp); vitest.config.ts excludes them.
export default defineConfig({
  test: {
    include: ['packages/mcp/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
