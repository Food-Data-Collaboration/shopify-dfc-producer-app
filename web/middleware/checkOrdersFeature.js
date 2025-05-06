import { query } from '../database/connect.js';

const checkOrdersFeature = async (req, res, next) => {
  try {
    const { shopName } = req;

    if (!shopName) {
      return res.status(403).json({
        success: false,
        message: 'Shop not found'
      });
    }

    const shopResult = await query(
      'SELECT orders_feature_enabled FROM shops WHERE shop_name = $1',
      [shopName]
    );

    if (shopResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    const { ordersFeatureEnabled } = shopResult.rows[0];

    if (!ordersFeatureEnabled) {
      return res.status(403).json({
        success: false,
        message: 'Orders feature is not enabled for this shop'
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

export default checkOrdersFeature;
