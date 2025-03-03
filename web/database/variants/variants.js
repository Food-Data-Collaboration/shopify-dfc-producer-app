import { query } from '../connect.js';

async function getVariants() {
  return (await query('SELECT * FROM fdc_variants order by product_id')).rows;
}

async function getVariantsByProductId(productId) {
  return (
    await query('SELECT * FROM fdc_variants where product_id = $1', [productId])
  ).rows;
}

async function variantCount() {
  return Number(
    (await query('SELECT count(*) FROM fdc_variants')).rows[0].count
  );
}

async function addVariant({
  productId, retailVariantId, wholesaleVariantId, noOfItemsPerPackage, enabled = false
}) {
  return (await query(
    'INSERT INTO fdc_variants (product_id, wholesale_variant_id, retail_variant_id, no_of_items_per_package, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [
      productId,
      wholesaleVariantId,
      retailVariantId,
      noOfItemsPerPackage,
      enabled
    ]
  ))?.rows[0];
}

async function updateVariant(
  variantId,
  { retailVariantId, wholesaleVariantId, noOfItemsPerPackage }
) {
  return (await query(
    'UPDATE fdc_variants SET wholesale_variant_id = $2, retail_variant_id = $3, no_of_items_per_package = $4  WHERE id = $1 RETURNING *',
    [
      variantId,
      wholesaleVariantId,
      retailVariantId,
      noOfItemsPerPackage
    ]
  ))?.rows[0];
}

async function toggleVariantMappingStatus(variantId) {
  return (await query('UPDATE fdc_variants SET enabled = NOT enabled WHERE id = $1 RETURNING *', [variantId]))?.rows[0];
}

async function deleteVariant(variantId) {
  return (await query('DELETE from fdc_variants WHERE id = $1', [variantId]))?.rows[0];
}

async function getPagedVariants(lastId, limit) {
  return (
    await query(
      'SELECT * FROM fdc_variants where product_id > $1 order by product_id limit $2',
      [lastId, limit]
    )
  ).rows;
}

function indexedByProductId(variants) {
  return variants.reduce((accumulator, row) => {
    const { productId } = row;
    return {
      ...accumulator,
      [productId]: accumulator[productId]
        ? [...accumulator[productId], row]
        : [row]
    };
  }, {});
}

function addFdcConfigurationToFdcProducts(products, variantsByProductId) {
  return products.map((product) => ({
    ...product,
    fdcVariants: variantsByProductId[product.id] || []
  }));
}

async function combineFdcProductsWithTheirFdcConfiguration(products) {
  return addFdcConfigurationToFdcProducts(
    products,
    indexedByProductId(await getVariants())
  );
}

export {
  getVariants,
  getVariantsByProductId,
  getPagedVariants,
  indexedByProductId,
  variantCount,
  combineFdcProductsWithTheirFdcConfiguration,
  addFdcConfigurationToFdcProducts as addVariantsToProducts,
  toggleVariantMappingStatus,
  addVariant,
  updateVariant,
  deleteVariant
};
