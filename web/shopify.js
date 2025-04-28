/* eslint-disable no-useless-constructor */
/* eslint-disable indent */
import '@shopify/shopify-api/adapters/node';
import { LATEST_API_VERSION } from '@shopify/shopify-api';
import { shopifyApp } from '@shopify/shopify-app-express';
import { PostgreSQLSessionStorage } from '@shopify/shopify-app-session-storage-postgresql';
import { restResources } from '@shopify/shopify-api/rest/admin/2023-01';
import config from './config.js';

const scopes = [
  'write_products',
  'read_products',
  'write_draft_orders',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'write_customers',
  'write_orders',
  'read_orders',
  'read_fulfillments',
  'write_fulfillments',
  'read_assigned_fulfillment_orders',
  'write_assigned_fulfillment_orders',
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
  'read_third_party_fulfillment_orders',
  'write_third_party_fulfillment_orders',
  'read_payment_terms',
  'write_payment_terms'
];

const apiObject =
  process.env.NODE_ENV === 'development'
    ? {
        apiVersion: LATEST_API_VERSION,
        restResources,
        billing: undefined,
        apiSecretKey: config.SHOPIFY_API_SECRET_KEY,
        HOST: config.HOST,
        scopes
      }
    : {
        apiVersion: LATEST_API_VERSION,
        restResources,
        billing: undefined,
        scopes
      };

const shopify = shopifyApp({
  api: apiObject,
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback'
  },
  webhooks: {
    path: '/api/webhooks'
  },
  sessionStorage: new PostgreSQLSessionStorage(`${config.DATABASE_HOST_URL}/${config.SHOP_REGISTRY_DATABASE_NAME}`)
});

export default shopify;
