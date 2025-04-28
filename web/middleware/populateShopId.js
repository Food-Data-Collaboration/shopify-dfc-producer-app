const populateShopId = (req, res, next) => {
  const { shopifySession } = req;

  if (!shopifySession) {
    return next('No Shopify session found');
  }

  const { shop } = shopifySession;

  const shopName = shop.replace('.myshopify.com', '');

  req.shopName = shopName;

  return next();
};

export default populateShopId;
