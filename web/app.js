/* eslint-disable function-paren-newline */
// @ts-nocheck
import { join } from "path";
import { readFileSync } from "fs";
import dotenv from "dotenv";
import express from "express";
import serveStatic from "serve-static";
import cors from "cors";
import legacyfdcRouter from "./legacy-fdc-modules/legacy-fdc-routers.js";
import shopify from "./shopify.js";
import webhookHandlers from "./webhooks/index.js";

import checkUserAccessPermissions from "./middleware/checkUserAccessPermissions.js";

import ProductsModules from "./api-modules/products/index.js";
import UsersModules from "./api-modules/users/index.js";
import checkOnlineSession from "./middleware/checkOnlineSession.js";

import fdcOrderRoutes from "./fdc-modules/orders/index.js";
import fdcProductRoutes from "./fdc-modules/products/index.js";

dotenv.config();

const errorMiddleware = (err, _req, res, _next) => {
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      // @ts-ignore
      message: err.message,
    });
  }

  // @ts-ignore
  return res.status(500).json({
    message: err.message,
    stack: err.stack,
  });
};

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers,
  })
);

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

app.use("/fdc", cors(), express.json(), legacyfdcRouter, errorMiddleware);

//todo: Who's enterprise is this? Is a hub posting to their own enterprise endpoint? Is it something that exists on the producer? Ask Garethe
app.use(
  "/api/dfc/Enterprises/:EnterpriseName/Orders",
  cors(),
  express.text({ type: "*/json" }),
  checkUserAccessPermissions,
  fdcOrderRoutes,
  errorMiddleware
);

app.use(
  "/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts",
  cors(),
  express.json(),
  checkUserAccessPermissions,
  fdcProductRoutes,
  errorMiddleware
);

app.use(
  "/api/products",
  shopify.validateAuthenticatedSession(),
  express.json(),
  checkOnlineSession,
  ProductsModules.Controllers,
  errorMiddleware
);
app.use(
  "/api/hub-users",
  shopify.validateAuthenticatedSession(),
  express.json(),
  checkOnlineSession,
  UsersModules.Controllers,
  errorMiddleware
);

app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res) =>
  res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")))
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
