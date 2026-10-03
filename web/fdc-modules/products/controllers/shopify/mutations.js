/**
 * Shopify product/variant mutations for the LDP write path.
 *
 * The read path (`products.js`) already exists and is left untouched. These are
 * the write counterparts, restricted to what the Shopify Admin GraphQL API can
 * actually express.
 *
 * ## Why the writable surface is this small
 *
 * Shopify has no single-variant update mutation — `productVariantsBulkUpdate`
 * is the only way to change a variant, and its `ProductVariantsBulkInput`
 * accepts a fixed set of fields. Two things this code originally tried to write
 * are simply not in that set:
 *
 *   - `title` — a variant's title is derived from its option values
 *     ("Default Title" for a single-variant product). There is no input that
 *     sets it directly.
 *   - `imageSrc` — variant media is attached through the mutation's separate
 *     `media` argument, not the variant input, and replacing existing variant
 *     media through the bulk mutation is not supported.
 *
 * Sending either anyway makes GraphQL reject the whole mutation *before* it
 * updates anything, so the caller gets an opaque validation error and nothing
 * is written. `buildVariantInput` therefore whitelists fields rather than
 * passing through whatever the caller built, and the LDP controller rejects
 * unsupported DFC predicates up front with a 422 that names what is supported.
 *
 * `PRODUCT_VARIANT_BULK_INPUT_FIELDS` is the authoritative list, kept here so
 * the unit tests can assert the builder never emits a field outside it.
 */

/**
 * Every field `ProductVariantsBulkInput` accepts, as of the Admin API version
 * this app pins. Anything not in this set is rejected by GraphQL at validation
 * time, so the builder must never emit it.
 */
export const PRODUCT_VARIANT_BULK_INPUT_FIELDS = [
  'barcode',
  'barcodes',
  'compareAtPrice',
  'id',
  'inventoryItem',
  'inventoryPolicy',
  'inventoryQuantities',
  'mediaId',
  'mediaSrc',
  'metafields',
  'optionValues',
  'price',
  'published',
  'quantityAdjustments',
  'requiresComponents',
  'showUnitPrice',
  'taxable',
  'taxCode',
  'unitPriceMeasurement'
];

const gid = (type, id) => `gid://shopify/${type}/${id}`;

const unprocessable = (detail) => {
  const error = new Error(detail);
  error.status = 422;
  error.title = 'Unprocessable entity';
  return error;
};

const badRequest = (detail) => {
  const error = new Error(detail);
  error.status = 400;
  error.title = 'Bad request';
  return error;
};

const throwOnGraphQLErrors = (response, action) => {
  if (response.errors) {
    // eslint-disable-next-line no-console
    console.error(`Failed to ${action}`, JSON.stringify(response.errors));
    const error = new Error(`Failed to ${action}`);
    error.status = 502;
    error.title = 'Upstream error';
    throw error;
  }
  return response.data;
};

const throwOnUserErrors = (payload, action) => {
  const { userErrors } = payload || {};
  if (userErrors && userErrors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Shopify rejected the ${action}`, JSON.stringify(userErrors));
    throw unprocessable(userErrors.map(({ message }) => message).join('; '));
  }
};

const VARIANT_FIELDS = `
  id
  title
  price
  sku
  image { id src altText }
  product { id }
`;

/**
 * Build the `ProductVariantsBulkInput` for one variant.
 *
 * Exported and pure so the tests can assert the shape directly — a mocked
 * `client.request` proves nothing about whether the mutation would survive
 * GraphQL validation, which is exactly the bug this module had.
 *
 * @param {object} update only the keys the caller wants to change
 * @param {number} variantId
 * @returns {object} a valid ProductVariantsBulkInput
 */
export const buildVariantInput = (update, variantId) => {
  const input = { id: gid('ProductVariant', variantId) };

  if (update.price !== undefined && update.price !== null) {
    input.price = String(update.price);
  }

  if (update.sku !== undefined && update.sku !== null) {
    // SKU lives on the inventory item, not the variant, since API 2024-10.
    input.inventoryItem = { sku: String(update.sku) };
  }

  if (update.compareAtPrice !== undefined) {
    input.compareAtPrice = String(update.compareAtPrice);
  }

  if (update.inventoryPolicy !== undefined) {
    input.inventoryPolicy = update.inventoryPolicy;
  }

  if (update.taxable !== undefined) {
    input.taxable = update.taxable;
  }

  // Defence in depth: if a future caller adds a key that slipped past the
  // whitelist, fail here rather than letting Shopify reject the whole mutation
  // with an opaque validation error.
  const stray = Object.keys(input).filter(
    (key) => !PRODUCT_VARIANT_BULK_INPUT_FIELDS.includes(key)
  );
  if (stray.length > 0) {
    throw badRequest(
      `Fields not accepted by ProductVariantsBulkInput: ${stray.join(', ')}`
    );
  }

  return input;
};

/**
 * Apply a partial update to a Shopify variant.
 *
 * @param {object} update subset of { price, sku, compareAtPrice,
 *   inventoryPolicy, taxable }
 * @returns {Promise<object|null>} the updated variant, or null when there was
 *   nothing to do.
 */
export async function updateVariantInShopify(client, { retailVariantId }, update) {
  const input = buildVariantInput(update, retailVariantId);

  // Only `id` means the caller had nothing writable to send.
  if (Object.keys(input).length === 1) {
    return null;
  }

  const response = await client.request(
    `mutation dfcVariantUpdate($input: ProductVariantsBulkInput!) {
       productVariantsBulkUpdate(productId: $productId, variants: [$input]) {
         userErrors { field message }
         productVariants { ${VARIANT_FIELDS} }
       }
     }`,
    {
      variables: {
        input,
        // The mutation needs the parent product id as well; the controller
        // supplies it on the mapping.
        productId: gid('Product', update.productId)
      }
    }
  );

  const data = throwOnGraphQLErrors(response, 'update variant');
  throwOnUserErrors(data.productVariantsBulkUpdate, 'variant update');

  return (data.productVariantsBulkUpdate.productVariants || [])[0] || null;
}

/**
 * Update a product's `title` and/or `descriptionHtml`.
 *
 * This is where `dfc-b:description` lands, and — unlike the variant title — a
 * product title *is* writable, so `dfc-b:name` on a parent product can be
 * honoured here.
 */
export async function updateProductDetails(client, productId, { title, descriptionHtml }) {
  const input = { id: gid('Product', productId) };

  if (title !== undefined) {
    input.title = title === null ? '' : String(title);
  }
  if (descriptionHtml !== undefined) {
    input.descriptionHtml = descriptionHtml === null ? '' : String(descriptionHtml);
  }

  if (Object.keys(input).length === 1) {
    return null;
  }

  const response = await client.request(
    `mutation dfcProductUpdate($input: ProductInput!) {
       productUpdate(input: $input) {
         userErrors { field message }
         product { id title descriptionHtml }
       }
     }`,
    { variables: { input } }
  );

  const data = throwOnGraphQLErrors(response, 'update product');
  throwOnUserErrors(data.productUpdate, 'product update');
  return data.productUpdate.product;
}

/**
 * Verify a variant exists **and belongs to the given product**.
 *
 * The earlier version checked only that the variant existed somewhere in the
 * shop, so a POST naming a real variant from product A and a real parent
 * product B passed both checks and inserted a mapping that could never
 * resolve. Verifying the parent is what makes the mapping meaningful.
 */
export async function findVariant(client, productId, variantId) {
  const response = await client.request(
    `query dfcVariant($id: ID!) {
       node(id: $id) {
         ... on ProductVariant {
           ${VARIANT_FIELDS}
         }
       }
     }`,
    { variables: { id: gid('ProductVariant', variantId) } }
  );

  const { node } = throwOnGraphQLErrors(response, 'load variant');

  if (!node) {
    return null;
  }

  const variant = {
    ...node,
    id: String(node.id).split('/').pop(),
    productId: node.product?.id ? String(node.product.id).split('/').pop() : null
  };

  if (productId !== undefined && String(productId) !== variant.productId) {
    const error = new Error(
      `Variant ${variantId} belongs to product ${variant.productId}, not ${productId}`
    );
    error.status = 409;
    error.title = 'Conflict';
    throw error;
  }

  return variant;
}

/** The variants of a product, used to resolve a product id for POST validation. */
export async function findProductVariants(client, productId) {
  const response = await client.request(
    `query dfcProduct($id: ID!) {
       node(id: $id) {
         ... on Product {
           id
           title
           variants(first: 250) {
             nodes { ${VARIANT_FIELDS} }
           }
         }
       }
     }`,
    { variables: { id: gid('Product', productId) } }
  );

  const { node } = throwOnGraphQLErrors(response, 'load product');

  if (!node) {
    return null;
  }

  return {
    id: String(node.id).split('/').pop(),
    title: node.title,
    variants: node.variants.nodes.map((variant) => ({
      ...variant,
      id: String(variant.id).split('/').pop()
    }))
  };
}

/** The shop's currency code, used to reject cross-currency price writes. */
export async function findShopCurrency(client) {
  const response = await client.request(
    'query dfcShopCurrency { shop { currencyCode } }'
  );

  const data = throwOnGraphQLErrors(response, 'load shop currency');
  return data.shop?.currencyCode || null;
}
