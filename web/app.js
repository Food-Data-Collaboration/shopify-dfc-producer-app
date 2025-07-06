/* eslint-disable function-paren-newline */
// @ts-nocheck
import { join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import express from 'express';
import serveStatic from 'serve-static';
import cors from 'cors';
import morgan from 'morgan';
import legacyfdcRouter from './legacy-fdc-modules/legacy-fdc-routers.js';
import shopify from './shopify.js';
import webhookHandlers from './webhooks/index.js';
import checkUserAccessPermissions from './middleware/checkUserAccessPermissions.js';
import checkOrdersFeature from './middleware/checkOrdersFeature.js';
import checkScopePermissions from './middleware/checkScopePermissions.js';

import ProductsModules from './api-modules/products/index.js';
import UsersModules from './api-modules/users/index.js';
import ShopModules from './api-modules/shop/index.js';
import checkOnlineSession from './middleware/checkOnlineSession.js';

import scopes from './fdc-modules/scopes.js';
import portals from './fdc-modules/portals/index.js';
import fdcOrderRoutes from './fdc-modules/orders/index.js';
import fdcProductRoutes from './fdc-modules/products/index.js';
import { getEnterprise, getEnterprises } from './fdc-modules/enterprises/controllers/index.js';
import { checkShopOnboarding } from './middleware/checkShopOnboarding.js';
import populateShop from './middleware/populateShopId.js';

dotenv.config();

const errorMiddleware = (err, _req, res, _next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      // @ts-ignore
      message: err.message
    });
  }

  // @ts-ignore
  return res.status(500).json({
    message: err.message,
    stack: err.stack
  });
};

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

app.use(morgan('combined'));

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers
  })
);

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  checkShopOnboarding,
  shopify.redirectToShopifyOrAppRoot()
);

app.use('/fdc', cors(), express.json(), legacyfdcRouter);

app.get(
  '/api/dfc/Enterprises',
  cors(),
  express.text({ type: '*/json' }),
  checkUserAccessPermissions,
  // checkScopePermissions, // Will be handled after client's input
  getEnterprises
);

app.get(
  '/api/dfc/Enterprises/:EnterpriseName',
  cors(),
  express.text({ type: '*/json' }),
  populateShop,
  checkUserAccessPermissions,
  checkScopePermissions,
  getEnterprise
);

app.use(
  '/api/dfc/Enterprises/:EnterpriseName/Orders',
  cors(),
  express.text({ type: '*/json' }),
  populateShop,
  checkUserAccessPermissions,
  checkOrdersFeature,
  checkScopePermissions,
  fdcOrderRoutes
);

app.use(
  '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts',
  cors(),
  express.json(),
  populateShop,
  checkUserAccessPermissions,
  checkScopePermissions,
  fdcProductRoutes
);

app.use(
  '/api/dfc/Enterprises/:EnterpriseName/Portals',
  cors(),
  express.json({ type: ['application/json', 'application/ld+json'] }),
  populateShop,
  // checkUserAccessPermissions,
  // checkScopePermissions,
  portals
);

app.use(
  '/api/scopes',
  express.json(),
  scopes
);

app.use(
  '/api/products',
  shopify.validateAuthenticatedSession(),
  express.json(),
  checkOnlineSession,
  populateShop,
  ProductsModules.Controllers
);

app.use(
  '/api/hub-users',
  shopify.validateAuthenticatedSession(),
  express.json(),
  checkOnlineSession,
  populateShop,
  checkOrdersFeature,
  UsersModules.Controllers
);

app.use(
  '/api/shop',
  shopify.validateAuthenticatedSession(),
  express.json(),
  checkOnlineSession,
  populateShop,
  ShopModules.Controllers
);

app.use(serveStatic(STATIC_PATH, { index: false }));

app.use('/*', shopify.ensureInstalledOnShop(), async (_req, res) =>
  res
    .status(200)
    .set('Content-Type', 'text/html')
    .send(readFileSync(join(STATIC_PATH, 'index.html')))
);

app.use(errorMiddleware);

export default app;

/**
 *
 * TODO:-
 * 1. Register the PRODUCTS_UPDATE webhook
 * 2. Link this webhook to the listener
 * 3. Create an endpoint to receive the access requests
 *    from the hub users and add their data like the listener url,
 *    shop name, etc to the database
 * 4. Register the PRODUCTS_UPDATE webhook on the hub side also and the PRODUCTS DELETE
 *  and based on them update the products table.
 *
 */
