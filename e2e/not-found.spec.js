const { test, expect } = require('@playwright/test');
const { navigateIframeTo } = require('./helpers');

const MOCK_ADMIN_PORT = process.env.MOCK_ADMIN_PORT || '3080';

function setupErrorTracking(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

test('NotFound page renders for unknown routes', async ({ page }) => {
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

  await navigateIframeTo(page, '/some-nonexistent-route-12345');

  const appFrame = page.frameLocator('#app-iframe');
  await expect(appFrame.locator('#app')).not.toBeEmpty({ timeout: 20000 });

  expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
});