const { test, expect } = require('@playwright/test');

function setupErrorTracking(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

test('PostInstallationSetup renders when shop setup is not complete', async ({ page }) => {
  await page.route('**/api/shop/details', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        shop: { shopName: 'test-shop', setupCompleted: false, ordersFeatureEnabled: false, hasPermissions: false },
      }),
    });
  });

  await page.route('**/api/shop/complete-setup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  const errors = [];
  setupErrorTracking(page, errors);

  await page.goto('/');
  await page.waitForSelector('#app-iframe', { timeout: 15000 });

  const appFrame = page.frameLocator('#app-iframe');
  await expect(appFrame.getByText('Completing Your Shop Setup')).toBeVisible({ timeout: 15000 });

  expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
});
