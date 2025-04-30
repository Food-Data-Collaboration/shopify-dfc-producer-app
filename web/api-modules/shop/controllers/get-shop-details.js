import { query } from '../../../database/connect.js';

const getShopDetails = async (req, res, next) => {
  try {
    const { shopName } = req;

    const shopDetails = await query('SELECT shop_name, variant_mappings_enabled, setup_completed FROM shops WHERE shop_name = $1', [shopName]);

    return res.json({
      shop: shopDetails.rows[0]
    });
  } catch (err) {
    return next(err);
  }
};

export default getShopDetails;
