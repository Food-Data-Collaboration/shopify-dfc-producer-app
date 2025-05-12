import { LATEST_API_VERSION } from '@shopify/shopify-api';

export default async function getLogo(store, storeFrontAccessToken) {
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

  if (!result?.data?.shop?.brand?.logo?.image?.url) {
    return null;
  }

  return result.data.shop.brand.logo.image.url;
}
