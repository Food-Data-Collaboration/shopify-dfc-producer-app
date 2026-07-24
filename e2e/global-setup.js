const { MockShopifyAdminServer } = require('@getverdict/mock-bridge');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  const apiKey = process.env.SHOPIFY_API_KEY || 'test-mock-key';
  const appUrl = `http://localhost:${process.env.BACKEND_PORT || '36329'}`;
  const port = Number(process.env.MOCK_ADMIN_PORT || '3080');

  const server = new MockShopifyAdminServer({
    appUrl,
    clientId: apiKey,
    port,
  });

  await server.start();
  global.__MOCK_SERVER__ = server;

  console.log(`\nMock Shopify Admin running at http://localhost:${port}\n`);
};
