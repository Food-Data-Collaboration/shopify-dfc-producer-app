const { test, expect } = require('@playwright/test');
const { navigateIframeTo } = require('./helpers');

const MOCK_ADMIN_PORT = process.env.MOCK_ADMIN_PORT || '3080';

function setupErrorTracking(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

test('ExitIframe page renders spinner and redirects to matching host redirectUri', async ({ page }) => {
  await page.route('**/api/shop/details', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        shop: { shopName: 'test-shop', setupCompleted: true, ordersFeatureEnabled: true, hasPermissions: true },
      }),
    });
  });

  const errors = [];
  setupErrorTracking(page, errors);

  await page.goto(`http://localhost:${MOCK_ADMIN_PORT}/`);
  await page.waitForSelector('#app-iframe', { timeout: 15000 });

  const redirectTarget = `http://localhost:${MOCK_ADMIN_PORT}/redirect-test-done`;
  await navigateIframeTo(page, '/exitIframe', { redirectUri: redirectTarget });

  await page.waitForURL('**/redirect-test-done', { timeout: 10000 });
  expect(page.url()).toContain('/redirect-test-done');

  expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
});