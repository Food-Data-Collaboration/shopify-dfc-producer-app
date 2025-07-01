import { query } from '../connect.js';

export const fetchShopDetails = async (shopName) => {
  const shopDetails = await query(
    `SELECT s.id, s.shop_name, s.variant_mappings_enabled, s.setup_completed, s.orders_feature_enabled, s.default_product_type, s.store_front_access_token,
     CASE WHEN COUNT(pp.id) > 0 THEN true ELSE false END as has_permissions
     FROM shops s
     LEFT JOIN portal_permissions pp ON s.id = pp.producer
     WHERE s.shop_name = $1
     GROUP BY s.id, s.shop_name, s.variant_mappings_enabled, s.setup_completed, s.orders_feature_enabled, s.default_product_type, s.store_front_access_token`,
    [shopName]
  );

  return shopDetails.rows[0];
};
