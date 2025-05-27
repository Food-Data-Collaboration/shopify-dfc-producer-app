import { query } from '../../database/connect.js';
import shopify from '../../shopify.js';
import getSession from '../../utils/getShopifySession.js';

const generateStorefrontAccessToken = async (client) => {
  const response = await client.request(`
   mutation storefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
    storefrontAccessTokenCreate(input: $input) {
      storefrontAccessToken {
        accessToken
      }
    }
  }`, {
    variables: {
      input: {
        title: 'FDC Storefront Access Token'
      }
    }
  });

  if (response.errors) {
    console.error('Failed to create storefront token', JSON.stringify(response.errors));
    throw new Error('Failed to create storefront token', response.errors);
  }

  return response.data.storefrontAccessTokenCreate.storefrontAccessToken.accessToken;
};

const registerShop = async (shopName, { dbName }) => {
  const session = await getSession(`${shopName}.myshopify.com`);
  const client = new shopify.api.clients.Graphql({ session });

  const storefrontAccessToken = await generateStorefrontAccessToken(client);

  try {
    const result = await query(
      `INSERT INTO shops 
       (shop_name, installed_at, setup_completed, db_name, store_front_access_token) 
       VALUES ($1, CURRENT_TIMESTAMP, FALSE, $2, $3)
       RETURNING *`,
      [shopName, dbName, storefrontAccessToken]
    );

    console.log(`Registered shop ${shopName} in registry`);
    return result.rows[0];
  } catch (error) {
    console.error(`Error registering shop ${shopName}:`, error);
    throw error;
  }
};

export default registerShop;
