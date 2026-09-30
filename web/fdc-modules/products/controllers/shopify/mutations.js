/**
 * Shopify product/variant mutations for the LDP write path.
 *
 * The read path (`products.js`) already exists and is left untouched. These are
 * the write counterparts: the minimum set of mutations needed to reflect a
 * hub's `PUT`/`PATCH` of a SuppliedProduct back into the shop.
 *
 * Errors from Shopify are translated into status-carrying errors so
 * `withLdpErrors` renders them as problem documents (a `userErrors` on a
 * product title is a 422, not a 500).
 */
import { getShopifyIdSubstring } from '../../../../database/utils/get-shopify-id-substring.js';

const gid = (type, id) => `gid://shopify/${type}/${id}`;

const unprocessable = (detail) => {
  const error = new Error(detail);
  error.status = 422;
  error.title = 'Unprocessable entity';
  return error;
};

const throwOnGraphQLErrors = (response, action) => {
  if (response.errors) {
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
`;

/**
 * Apply a partial update to a Shopify variant. Only the fields present in
 * `update` are sent, which is what makes this usable for both PUT (where
 * absent fields mean "reset") and PATCH (where absent means "leave alone") —
 * the caller decides which by only including keys it wants changed.
 */
export async function updateVariantInShopify(client, { retailVariantId, productId }, update) {
  const input = { id: gid('ProductVariant', retailVariantId) };

  if (update.title !== undefined) {
    input.title = update.title;
  }
  if (update.price !== undefined) {
    input.price = update.price;
  }
  if (update.imageSrc !== undefined) {
    input.imageSrc = update.imageSrc;
  }
  if (update.sku !== undefined) {
    input.sku = update.sku;
  }

  // Nothing to do — the caller filtered writable fields already.
  if (Object.keys(input).length === 1) {
    return null;
  }

  const response = await client.request(
    `mutation dfcVariantUpdate($input: ProductVariantsBulkInput!) {
       productVariantsBulkUpdate(productId: "${gid('Product', productId)}", variants: [$input]) {
         userErrors { field message }
         productVariants { ${VARIANT_FIELDS} }
       }
     }`,
    { variables: { input } }
  );

  const data = throwOnGraphQLErrors(response, 'update variant');
  throwOnUserErrors(data.productVariantsBulkUpdate, 'variant update');

  return (data.productVariantsBulkUpdate.productVariants || []).map((variant) => ({
    ...variant,
    id: getShopifyIdSubstring(variant.id)
  }))[0] || null;
}

/**
 * Verify a variant actually exists in the shop before we publish it. A hub
 * can POST a SuppliedProduct for a variant that was deleted out of band; that
 * should be a 404, not a dangling mapping row.
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
  return { ...node, id: getShopifyIdSubstring(node.id) };
}

/**
 * Update a product's `descriptionHtml`. The DFC `dfc-b:description` maps here
 * rather than onto the variant, because that is where Shopify stores it and
 * the read path reads it back from the parent product.
 */
export async function updateProductDescription(client, productId, descriptionHtml) {
  const response = await client.request(
    `mutation dfcProductUpdate($input: ProductInput!) {
       productUpdate(input: $input) {
         userErrors { field message }
         product { id }
       }
     }`,
    {
      variables: {
        input: { id: gid('Product', productId), descriptionHtml: descriptionHtml || '' }
      }
    }
  );

  const data = throwOnGraphQLErrors(response, 'update product');
  throwOnUserErrors(data.productUpdate, 'product update');
  return data.productUpdate.product;
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
    id: getShopifyIdSubstring(node.id),
    title: node.title,
    variants: node.variants.nodes.map((variant) => ({
      ...variant,
      id: getShopifyIdSubstring(variant.id)
    }))
  };
}
