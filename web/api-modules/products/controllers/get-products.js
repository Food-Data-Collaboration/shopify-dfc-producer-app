import { query } from '../../../database/connect.js';
import ProductUseCases from '../use-cases/index.js';

const getProducts = async (req, res) => {
  try {
    const { shopifySession, shopName } = req;

    const products = await ProductUseCases.getProducts({
      session: shopifySession,
      shopName
    });

    if (!products.length) {
      return res.status(200).json('No products found');
    }

    const shopDetails = await query('SELECT shop_name, variant_mappings_enabled FROM shops WHERE shop_name = $1', [shopName]);

    return res.status(200).json({
      products,
      variantMappingEnabled: shopDetails.rows[0].variantMappingsEnabled,
      success: true,
      message: 'Products retrieved successfully'
    });
  } catch (error) {
    console.error('Error retrieving products', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving products'
    });
  }
};

export default getProducts;
