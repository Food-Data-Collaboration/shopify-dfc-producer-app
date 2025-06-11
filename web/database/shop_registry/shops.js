import { query } from '../connect.js';

export const fetchShopDetails = async (shopName) => {
  const shopDetails = await query(
    'SELECT id, shop_name, variant_mappings_enabled, setup_completed, orders_feature_enabled, default_product_type, store_front_access_token FROM shops WHERE shop_name = $1',
    [shopName]
  );

  return shopDetails.rows[0];
};
