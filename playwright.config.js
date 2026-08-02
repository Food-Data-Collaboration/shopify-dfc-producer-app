const { defineConfig } = require('@playwright/test');
const { join } = require('path');

const BACKEND_PORT = process.env.BACKEND_PORT || '36329';
const MOCK_ADMIN_PORT = process.env.MOCK_ADMIN_PORT || '3080';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],

  use: {
    baseURL: `http://localhost:${MOCK_ADMIN_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  globalSetup: require.resolve('./e2e/global-setup.js'),
  globalTeardown: require.resolve('./e2e/global-teardown.js'),

  webServer: [
    {
      command: 'node index.js',
      port: Number(BACKEND_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      cwd: join(__dirname, 'web'),
      env: {
        BACKEND_PORT,
        MOCK_BRIDGE: '1',
        NODE_ENV: 'production',
        SHOPIFY_API_KEY: 'test-mock-key',
        SHOPIFY_API_SECRET: 'test-mock-secret',
        HOST: `http://localhost:${BACKEND_PORT}`,
        DATABASE_HOST_URL: 'postgresql://mock:5432',
        SHOP_REGISTRY_DATABASE_NAME: 'mock',
      },
    },
  ],
});
