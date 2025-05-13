import { query } from '../../../database/connect.js';

const completeSetup = async (req, res, next) => {
  try {
    const { shopName } = req;
    const { variantMappingsEnabled, defaultProductType } = req.body;

    const result = await query(
      'UPDATE shops SET variant_mappings_enabled = $1, default_product_type = $2, setup_completed = true WHERE shop_name = $3 RETURNING *',
      [variantMappingsEnabled, defaultProductType, shopName]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Shop not found'
      });
    }

    return res.status(200).json({
      shop: result.rows[0]
    });
  } catch (err) {
    return next(err);
  }
};

export default completeSetup;
