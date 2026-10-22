import { defineConfig } from '@playwright/test';

const port = 4789;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: `http://localhost:${port}/sizes.html`,
    env: { FIXTURE_PORT: String(port) },
    reuseExistingServer: true,
  },
});
