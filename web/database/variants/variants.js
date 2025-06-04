import { query } from '../connect.js';

async function getVariants(shopName) {
  return (await query('SELECT * FROM fdc_variants order by product_id', undefined, undefined, shopName)).rows;
}

async function getVariantsByProductId(productId, shopName) {
  return (
    await query('SELECT * FROM fdc_variants where product_id = $1', [productId], undefined, shopName)
  ).rows;
}

async function addVariant({
  productId, retailVariantId, wholesaleVariantId, noOfItemsPerPackage, enabled = false, shopName
}) {
  return (await query(
    'INSERT INTO fdc_variants (product_id, wholesale_variant_id, retail_variant_id, no_of_items_per_package, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [
      productId,
      wholesaleVariantId,
      retailVariantId,
      noOfItemsPerPackage,
      enabled
    ],
    undefined,
    shopName
  ))?.rows[0];
}

async function updateVariant(
  variantId,
  { retailVariantId, wholesaleVariantId, noOfItemsPerPackage },
  shopName
) {
  return (await query(
    'UPDATE fdc_variants SET wholesale_variant_id = $2, retail_variant_id = $3, no_of_items_per_package = $4  WHERE id = $1 RETURNING *',
    [
      variantId,
      wholesaleVariantId,
      retailVariantId,
      noOfItemsPerPackage
    ],
    undefined,
    shopName
  ))?.rows[0];
}

async function toggleVariantMappingStatus(variantId, shopName) {
  return (await query('UPDATE fdc_variants SET enabled = NOT enabled WHERE id = $1 RETURNING *', [variantId], undefined, shopName))?.rows[0];
}

async function setAllVariantMappingStatuses(variants, status, shopName) {
  return (await query(
    `INSERT into fdc_variants (product_id, retail_variant_id, enabled)
     (SELECT * FROM json_to_recordset($1)
       AS x("productId" bigint, "variantId" bigint, "status" boolean))
       on CONFLICT(product_id, retail_variant_id)
          DO UPDATE SET
               enabled = EXCLUDED.enabled 
            RETURNING *;`,
    [JSON.stringify(
      variants.map(({ productId, variantId }) => ({ productId, variantId, status }))
    )],
    undefined,
    shopName
  ))?.rows;
}

async function deleteVariant(variantId, shopName) {
  return (await query('DELETE from fdc_variants WHERE id = $1', [variantId], undefined, shopName))?.rows[0];
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

async function combineFdcProductsWithTheirFdcConfiguration(products, shopName) {
  return addFdcConfigurationToFdcProducts(
    products,
    indexedByProductId(await getVariants(shopName))
  );
}

export {
  getVariants,
  getVariantsByProductId,
  getPagedVariants,
  indexedByProductId,
  combineFdcProductsWithTheirFdcConfiguration,
  addFdcConfigurationToFdcProducts as addVariantsToProducts,
  toggleVariantMappingStatus,
  setAllVariantMappingStatuses,
  addVariant,
  updateVariant,
  deleteVariant
};
