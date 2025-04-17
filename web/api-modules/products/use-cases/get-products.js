import shopify from '../../../shopify.js';
import { getShopifyIdSubstring } from '../../../database/utils/get-shopify-id-substring.js';
import { combineFdcProductsWithTheirFdcConfiguration } from '../../../database/variants/variants.js';

const toProduct = (product) => ({
  ...product,
  id: getShopifyIdSubstring(product.id),
  variants: product?.variants?.edges.map(({ node: variant }) => ({
    ...variant,
    id: getShopifyIdSubstring(variant.id)
  }))
});

async function findProducts(client, after) {
  const response = await client.request(`
    query findProducts($after: String) {
      products(first: 250, after: $after, sortKey: TITLE) {
        edges {
          node {
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
        },
        pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
      }
    }
  `, { variables: { after } });

  if (response.errors) {
    console.error('Failed to load Products', JSON.stringify(response.errors));
    throw new Error('Failed to load Products');
  }

  const thisPage = response?.data?.products?.edges.map(({ node: product }) =>
    toProduct(product));

  if (response?.data?.products?.pageInfo.hasNextPage) {
    const rest = await findProducts(client, response?.data?.products?.pageInfo.endCursor);
    return [...thisPage, ...rest];
  } return thisPage;
}

const getProducts = async ({ session }) => {
  const client = new shopify.api.clients.Graphql({ session });

  const products = await findProducts(client);
  if (!products.length) {
    return [];
  }

  return await combineFdcProductsWithTheirFdcConfiguration(products);
};

export default getProducts;
