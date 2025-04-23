import { query } from '../database/connect.js';
import { triggerShopOnboardingFlow } from '../flows/shop-onboarding/index.js';

export const checkShopOnboarding = async (req, res, next) => {
  try {
    const { session } = res.locals.shopify;

    const shopName = session.shop.replace('.myshopify.com', '');

    const shopResult = await query(
      'SELECT * FROM shops WHERE shop_name = $1',
      [shopName]
    );

    if (shopResult.rows.length > 0) {
      console.log(`Shop ${shopName} found in registry`);
      req.shopInfo = shopResult.rows[0];
      return next();
    }

    /**
     * If the shop is not found in the registry, we need to start the onboarding flow.
     * This includes creating the database, registering the shop, and building the tables.
     */

    console.log(`Shop ${shopName} not found in registry, starting onboarding flow`);
    const shop = await triggerShopOnboardingFlow(shopName);

    req.shopInfo = shop;
    next();
  } catch (error) {
    console.error('Error in checkShopOnboarding:', error);
    next();
  }
};
