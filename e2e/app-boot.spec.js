const { test, expect } = require('@playwright/test');

const BACKEND_PORT = process.env.BACKEND_PORT || '36329';
const APP_URL = `http://localhost:${BACKEND_PORT}`;

function setupErrorTracking(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

test('app mounts in mock admin with non-empty shopify-api-key', async ({ page }) => {
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
  await expect(appFrame.locator('#app')).not.toBeEmpty({ timeout: 20000 });

  const metaContent = await appFrame.locator('meta[name="shopify-api-key"]').getAttribute('content');
  expect(metaContent).toBeTruthy();
  expect(metaContent).not.toBe('');

  expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
});

test('meta shopify-api-key is non-empty on direct Express load', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(APP_URL);
  const html = await page.content();

  const match = html.match(/<meta name="shopify-api-key" content="([^"]*)"\s*\/?>/);
  expect(match).toBeTruthy();
  expect(match[1]).toBeTruthy();
  expect(match[1]).not.toBe('');
});
