import { fetchShopDetails } from '../database/shop_registry/shops.js';

const populateShop = async (req, res, next) => {
  const { shopifySession } = req;
  let shopName;

  if (req.params.EnterpriseName) {
    shopName = req.params.EnterpriseName;
  } else if (shopifySession) {
    shopName = shopifySession.shop.replace('.myshopify.com', '');
  } else {
    return next('No Shopify session found');
  }

  const shopDetails = await fetchShopDetails(shopName);

  if (!shopDetails) {
    return res.status(404).json({
      error: 'Shop not found'
    });
  }

  req.shopName = shopName;
  req.shopDefaultProductType = shopDetails.defaultProductType;
  req.shop = {
    shopName,
    storeFrontAccessToken: shopDetails.storeFrontAccessToken,
    ordersFeatureEnabled: shopDetails.ordersFeatureEnabled,
    id: shopDetails.id
  };

  return next();
};

export default populateShop;
