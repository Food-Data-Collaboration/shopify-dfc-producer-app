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
import config from './config.js';
import webhookHandlers from './webhooks/index.js';
import checkUserAccessPermissions from './middleware/checkUserAccessPermissions.js';
import checkOrdersFeature from './middleware/checkOrdersFeature.js';
import checkScopePermissions from './middleware/checkScopePermissions.js';

import ProductsModules from './api-modules/products/index.js';
import UsersModules from './api-modules/users/index.js';
import ShopModules from './api-modules/shop/index.js';
import checkOnlineSession from './middleware/checkOnlineSession.js';

import scopes from './fdc-modules/scopes.js';
import profile from './fdc-modules/profile.js';
import portals from './fdc-modules/portals/index.js';
import fdcOrderRoutes from './fdc-modules/orders/index.js';
import fdcProductRoutes from './fdc-modules/products/index.js';
import {
  getEnterprise,
  getEnterprises,
  enterprisesAreReadOnly
} from './fdc-modules/enterprises/controllers/index.js';
import { ldpOptions, withLdpErrors } from './fdc-modules/ldp/index.js';
import { checkShopOnboarding } from './middleware/checkShopOnboarding.js';
import populateShop from './middleware/populateShopId.js';
import rateLimit from './middleware/rateLimit.js';

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

// Every DFC route introspects an OIDC token (a network round trip to the IdP)
// before it authorizes anything, so the whole public surface is rate limited
// as one budget. Cheaper to mount once than per route, and it means a single
// caller cannot spread load across routes to dodge per-route caps.
const dfcRateLimit = rateLimit({
  windowMs: config.DFC_RATE_LIMIT_WINDOW_MS || 60_000,
  max: config.DFC_RATE_LIMIT_MAX || 120
});

// WebID self-description, unauthenticated like DjangoLDP's /profile.
app.get('/profile', cors(), profile);

// `Enterprises` is an LDP container. Read-only: an enterprise is provisioned by
// installing the app, not by an LDP write, so the other verbs answer 405 with
// an Allow header rather than pretending to be writable.
// `cors()` answers OPTIONS itself and, with the default
// `preflightContinue: false`, never calls next() — so an `ldpOptions` handler
// behind a bare `cors()` is dead code and the client never receives Allow,
// Link or Accept-Post. `preflightContinue: true` lets cors() set the CORS
// headers and hand off to the LDP handler, which adds the protocol ones.
const corsPreflight = () => cors({ preflightContinue: true });

// The wildcard `*/json` type does NOT match `application/ld+json` (that is
// `ld+json`, not `json`), so a hub following our own `Accept-Post` header
// would have its body silently left unparsed and order extraction would fail.
// Declared before the routes that use it.
const DFC_TEXT_TYPES = [
  'application/json',
  'application/ld+json',
  'text/json',
  'application/*+json'
];

app.options(
  '/api/dfc/Enterprises',
  corsPreflight(),
  ldpOptions({ container: true, writable: false })
);
app.get(
  '/api/dfc/Enterprises',
  cors(),
  dfcRateLimit,
  express.text({ type: DFC_TEXT_TYPES }),
  checkUserAccessPermissions,
  withLdpErrors(getEnterprises)
);

app.options(
  '/api/dfc/Enterprises/:EnterpriseName',
  corsPreflight(),
  ldpOptions({ container: false, writable: false })
);
app.get(
  '/api/dfc/Enterprises/:EnterpriseName',
  cors(),
  dfcRateLimit,
  express.text({ type: DFC_TEXT_TYPES }),
  populateShop,
  checkUserAccessPermissions,
  checkScopePermissions,
  withLdpErrors(getEnterprise)
);
// No checkScopePermissions here: the matrix has no enterprise *write* row, so
// with scope enforcement active it would answer 404 and the read-only 405
// contract would never be reached. Authentication still applies.
app.all(
  '/api/dfc/Enterprises/:EnterpriseName',
  cors(),
  dfcRateLimit,
  populateShop,
  checkUserAccessPermissions,
  enterprisesAreReadOnly
);

// LDP discovery for the DFC containers.
//
// Registered ahead of every `app.use` mount below, because an OPTIONS request
// must not need a database round trip: `populateShop` answers 404 for an
// unknown shop, and a hub asking "what can I do here?" has no way to supply a
// valid one. Inside the router the OPTIONS handler was unreachable for exactly
// that reason.
//
// `corsPreflight` matters too: with the default `preflightContinue: false`
// cors() answers OPTIONS itself and never calls next(), so an ldpOptions handler
// behind a bare cors() is dead code.

app.options(
  '/api/dfc/Enterprises/:EnterpriseName/Orders',
  corsPreflight(),
  ldpOptions({ container: true, writable: true })
);
app.options(
  '/api/dfc/Enterprises/:EnterpriseName/Orders/:id',
  corsPreflight(),
  ldpOptions({ container: false, writable: true })
);
app.options(
  '/api/dfc/Enterprises/:EnterpriseName/Orders/:id/orderLines',
  corsPreflight(),
  ldpOptions({ container: true, writable: true })
);
app.options(
  '/api/dfc/Enterprises/:EnterpriseName/Orders/:id/orderLines/:lineId',
  corsPreflight(),
  ldpOptions({ container: false, writable: true })
);

// The wildcard `*/json` type does NOT match `application/ld+json`, so the
// Orders mount uses DFC_TEXT_TYPES for the same reason as the enterprise
// routes: a hub posting JSON-LD must actually get its body parsed.
app.use(
  '/api/dfc/Enterprises/:EnterpriseName/Orders',
  cors(),
  dfcRateLimit,
  express.text({ type: DFC_TEXT_TYPES }),
  populateShop,
  checkUserAccessPermissions,
  checkOrdersFeature,
  checkScopePermissions,
  fdcOrderRoutes
);

app.options(
  '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts',
  corsPreflight(),
  ldpOptions({ container: true, writable: true })
);
app.options(
  '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts/:ProductId',
  corsPreflight(),
  ldpOptions({ container: false, writable: true })
);

// SuppliedProducts is the writable LDP container: POST publishes a Shopify
// variant, and members support GET/PUT/PATCH/DELETE. The body parser accepts
// JSON-LD as well as plain JSON so a hub can POST `application/ld+json`.
app.use(
  '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts',
  cors(),
  dfcRateLimit,
  express.json({
    type: ['application/json', 'application/ld+json', 'text/json'],
    limit: '5mb'
  }),
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
app.use('/assets', serveStatic(`${process.cwd()}/frontend/assets`, { index: false }));

if (process.env.MOCK_BRIDGE === '1') {
  app.use('/*', async (_req, res) => {
    res
      .status(200)
      .set('Content-Type', 'text/html')
      .send(readFileSync(join(STATIC_PATH, 'index.html')));
  });
} else {
  app.use('/*', shopify.ensureInstalledOnShop(), async (_req, res) =>
    res
      .status(200)
      .set('Content-Type', 'text/html')
      .send(readFileSync(join(STATIC_PATH, 'index.html')))
  );
}

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
