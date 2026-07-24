const { test, expect } = require('@playwright/test');

function setupErrorTracking(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

test('home page renders product cards with mocked data', async ({ page }) => {
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

  await page.goto('/');
  await page.waitForSelector('#app-iframe', { timeout: 15000 });

  const appFrame = page.frameLocator('#app-iframe');
  await expect(appFrame.getByText('Welcome to the FDC producer app')).toBeVisible({ timeout: 20000 });
  await expect(appFrame.getByText('Get started')).toBeVisible({ timeout: 10000 });
  await expect(appFrame.getByText('Edit permissions')).toBeVisible({ timeout: 5000 });

  expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
});
