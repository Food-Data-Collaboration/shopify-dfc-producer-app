import { exportSuppliedProducts } from '../../../connector/productUtils.js';
import { addVariantsToProducts } from '../../../database/variants/variants.js';
import config from '../../../config.js';

export default async function createDFCProductsFromShopify(
  fdcProducts,
  fdcVariantsByProductId
) {
  try {
    const exportedDFCProducts = await exportSuppliedProducts(
      addVariantsToProducts(fdcProducts, fdcVariantsByProductId),
      config.PRODUCER_SHOP_NAME
    );

    return exportedDFCProducts;
  } catch (error) {
    console.error('Unable to export products', error);
    throw new Error(error);
  }
}
