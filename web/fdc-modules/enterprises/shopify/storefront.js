import { LATEST_API_VERSION } from '@shopify/shopify-api';

const SHOPIFY_STORE_REGEX = /^[a-z0-9][a-z0-9-]+$/i;

export default async function getLogo(store, storeFrontAccessToken) {
  if (!store || !SHOPIFY_STORE_REGEX.test(store) || store.length > 20) {
    throw new Error(`Invalid Shopify store name: ${store}`);
  }

  const response = await fetch(`https://${store}.myshopify.com/api/${LATEST_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storeFrontAccessToken
    },
    body: JSON.stringify({
      query: `{
        shop {
          brand {
            logo
            {
              image {
                url
              }
            }
          }
        }
      }`
    })
  });

  const result = await response.json();

  console.log('Result from storefront api:', JSON.stringify(result));

  if (!result?.data?.shop?.brand?.logo?.image?.url) {
    return null;
  }

  return result.data.shop.brand.logo.image.url;
}
