import { getShopifyIdSubstring } from '../../../../database/utils/get-shopify-id-substring.js';
import {
  getVariants,
  getVariantsByProductId,
  indexedByProductId
} from '../../../../database/variants/variants.js';

const query = `query findProducts($ids: [ID!]!) {
  shop {
    currencyCode
  }
  products: nodes(ids: $ids) {
    ... on Product {
      id
      title
      descriptionHtml
      productType
      status
      images(first: 10) {
        edges {
          node {
            id
            altText
            src
          }
        }
      }
      variants(first: 250) {
        edges {
          node {
            id
            title
            price
            sku
            position
            inventoryPolicy
            taxable
            inventoryQuantity
            inventoryItem {
              measurement {
                weight {
                  unit
                  value
                }
              }
            }
            image {
              id
              altText
              src
            }
          }
        }
      }
    }
  }
}`;

const toFdcProduct = (product, currencyCode) => ({
  ...product,
  id: getShopifyIdSubstring(product?.id),
  images: product?.images?.edges?.map(({ node }) => ({
    ...node,
    id: getShopifyIdSubstring(node.id)
  })),
  variants: product.variants.edges.map(({ node: variant }) => ({
    ...variant,
    id: getShopifyIdSubstring(variant.id),
    currencyCode,
    image: variant.image && {
      ...variant.image,
      id: getShopifyIdSubstring(variant.image.id)
    }
  }))
});

export async function findProductsByIds(client, ids) {
  const response = await client.request(query, {
    variables: { ids: ids.map((id) => `gid://shopify/Product/${id}`) }
  });
  if (response.errors) {
    throw new Error('Failed to load Products');
  }
  const products =
    response.data.products?.filter((product) => product !== null) || [];
  const currencyCode = response.data?.shop?.currencyCode || 'GBP';

  if (products.length > 0) {
    return products.map((product) => toFdcProduct(product, currencyCode));
  }
  return [];
}

export async function findFDCProducts(client, fdcVariantsFromDB) {
  return findProductsByIds(client, fdcVariantsFromDB);
}

export async function getFdcVariantsFromDB() {
  const variants = await getVariants();
  const mappedVariantsByProductId = indexedByProductId(variants);

  return mappedVariantsByProductId;
}

export async function getFdcVariantsByProductIdFromDB(productId) {
  const variants = await getVariantsByProductId(productId);
  const mappedVariantsByProductId = indexedByProductId(variants);

  return mappedVariantsByProductId;
}
