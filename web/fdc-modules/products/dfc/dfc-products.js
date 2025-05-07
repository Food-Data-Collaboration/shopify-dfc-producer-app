import { exportSuppliedProducts } from '../../../connector/productUtils.js';
import { addVariantsToProducts } from '../../../database/variants/variants.js';

export default async function createDFCProductsFromShopify(
  fdcProducts,
  fdcVariantsByProductId,
  enterpriseName
) {
  try {
    const exportedDFCProducts = await exportSuppliedProducts(
      addVariantsToProducts(fdcProducts, fdcVariantsByProductId),
      enterpriseName
    );

    return exportedDFCProducts;
  } catch (error) {
    console.error('Unable to export products', error);
    throw new Error(error);
  }
}
