import { query } from '../../../database/connect.js';

const completeSetup = async (req, res, next) => {
  try {
    const { shopName } = req;
    const { variantMappingsEnabled } = req.body;

    const result = await query(
      'UPDATE shops SET variant_mappings_enabled = $1, setup_completed = true WHERE shop_name = $2 RETURNING *',
      [variantMappingsEnabled, shopName]
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
