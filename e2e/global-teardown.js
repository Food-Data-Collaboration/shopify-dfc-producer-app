module.exports = async () => {
  if (global.__MOCK_SERVER__) {
    await global.__MOCK_SERVER__.stop();
    console.log('\nMock Shopify Admin stopped.\n');
  }
};
