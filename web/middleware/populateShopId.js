import { query } from '../database/connect.js';

const populateShop = async (req, res, next) => {
  const { shopifySession } = req;

  if (req.params.EnterpriseName) {
    const shopResult = await query(
      'SELECT * FROM shops WHERE shop_name = $1',
      [req.params.EnterpriseName]
    );

    if (shopResult.rows.length > 0) {
      const {
        shopName,
        storeFrontAccessToken
      } = shopResult.rows[0];
      req.shop = { shopName, storeFrontAccessToken };
      return next();
    }
    return res.status(404).json({
      error: 'Shop not found'
    });
  }

  if (!shopifySession) {
    return next('No Shopify session found');
  }

  const { shop } = shopifySession;

  const shopName = shop.replace('.myshopify.com', '');

  req.shopName = shopName;

  return next();
};

export default populateShop;
