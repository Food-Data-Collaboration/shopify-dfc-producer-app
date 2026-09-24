# AGENTS.md — shopify-dfc-producer-app

## Setup

- Node >=20.10.0 (`web/package.json` engines). `web/` is ESM (`"type": "module"`), root is CJS.
- Install with `yarn` only (don't use `npm install`): `yarn install --frozen-lockfile`, then `yarn --cwd web install --frozen-lockfile`, then `yarn --cwd web/frontend install --frozen-lockfile` (same 3-step order as CI). Lockfiles are tracked — `yarn.lock` + `package-lock.json` at root and in `web/`, plus `web/frontend/yarn.lock` — don't delete any.
- Env: `web/.env` (not root). Loaded by `web/config.js` (handles cwd `web` vs root); yup schema has no `.required()` so missing vars are `undefined`, not errors. `OIDC_TRUSTED_AUDIENCES` allowlists hub token audiences (runbook: `DEPLOYMENT_STRATEGY.md` §2). `shopify.app.*.toml` are per-developer CLI configs.
- DB local: `local-db/docker-compose.yml` (postgres on 5435 with SSL on + pgAdmin on 5050). Connection strings in `local-db/readme.md`. Build schema: `yarn build:db` (runs `web/database/build.js` — target DB `SHOP_REGISTRY_DATABASE_NAME` must already exist; `DATABASE_HOST_URL` excludes db name).
- Orders work: read `.opencode/dfc-orders.md` (route/middleware flow) and `.opencode/dfc-orders-common-patterns.md` (Shopify↔OFN parity) first.

## Commands

| Command | Notes |
|---------|-------|
| `yarn dev` (root) | Shopify CLI dev — 3 ports `36327/36328/36329` (`cross-env SERVER_PORT/FRONTEND_PORT/BACKEND_PORT`). Use `--reset` on first run. |
| `cd web && yarn serve` | Production Express server |
| `npm test` | `jest --runInBand --detectOpenHandles --forceExit web/*` — excludes `acceptance-tests/` and `e2e/` |
| `npx jest path/to/file.spec.js` | Single test (from root) — for blank-node diffs use `Received:` from the full `npm test` run, not isolation |
| `npm run acceptance-test` | Targets `acceptance-tests/` (singular script name) — NOT runnable as-is: `order.spec.js` ships with empty `refreshToken`/product IDs/`SHOP_NAME`, needs live server + OIDC |
| `npm run test:e2e:build` | Builds `web/frontend` (`vite build`), starts server `MOCK_BRIDGE=1`, mock admin on 3080, runs Playwright |
| `npm run build:db` | `node ./web/database/build.js` |
| ESLint/Prettier | Configured in `web/.eslintrc.cjs` (airbnb base). No separate typecheck. |

## Architecture

- Entrypoint `web/app.js` (Express). Routes:
  - `/api/dfc/Enterprises/:EnterpriseName/{Orders,SuppliedProducts,Portals}` — DFC API. Body parsing differs per route: Orders + enterprise detail use `express.text({type:'*/json'})`, SuppliedProducts uses `express.json()`, Portals uses `express.json({type:['application/json','application/ld+json']})`
  - `/api/{products,hub-users,shop}` — Shopify-session APIs (`shopify.validateAuthenticatedSession()` + `checkOnlineSession`)
  - `/fdc` — legacy (`web/legacy-fdc-modules/`)
  - `/api/scopes` — unauthenticated
- DFC middleware varies by route: enterprise detail and SuppliedProducts use `populateShop` → `checkUserAccessPermissions` → `checkScopePermissions`; Orders also adds `checkOrdersFeature`; the enterprise collection omits shop/scope checks, and Portals currently uses only `populateShop`.
- Modules: `web/fdc-modules/{orders,enterprises,products,portals}` (controllers + `dfc/` transforms), `web/api-modules/{products,users,shop}`, `web/legacy-fdc-modules/`.
- DB multi-tenant: central `shop_registry` → per-shop pools via `web/database/connect.js:getShopDbConnection(shopId)`, SSL `rejectUnauthorized:false`. Schema per module (`web/database/{shop_registry,orders,portals,users,...}/schema.sql`); `migrations.sql` + `auto-timestamp.sql`.
- Connector singleton `web/connector/index.js` — lazy, cached `new Connector()` (bundled v2 taxonomies, no init files).
- Frontend `web/frontend/` — Vite + React + Polaris, `vite build` → `web/frontend/dist`, served by Express static. `dev_embed.js` for Shopify.
- Docker `Dockerfile` copies only `web/`, deletes `yarn.lock` (`RUN rm yarn.lock`) then `yarn` + frontend build. CI `build-and-deploy.yml` (reusable, pushes `ghcr.io`), `deploy-staging.yml` (staging branch), `deploy-main.yml` (main). CI runs Playwright only (`frontend-test` gates Docker build); jest is not in CI.

## Connector `@fooddatacollaboration/linkml-connector` (v2.0.1, `file:` dep)

- Local package at `../DFC-LinkML/typescript-connector`, wired via `file:` in root + `web/package.json`. Import `@fooddatacollaboration/linkml-connector`. Needs Node ≥20 (shell may default to 18 — use nodenv 24 for `web/` installs).
- Singleton `web/connector/index.js` is just `new Connector()` — v2.0.0 taxonomies bundle in the constructor. No thesaurus loading (deleted `web/connector/thesaurus/`, `dfcContext.js`).
- Creation: `connector.createX(semanticId, params)` or `createX({semanticId, ...})` / `new X(semanticId, params)`. Blank-node ids by hand (`_:bN`, `_:qty_N` counters).
- Field access, not getters: `o.semanticId`, `o.hasOrderStatus`, `o.quantity`, `line.concerns`, `offer.offers` (string ids or resolved objects — handle both).
- Vocab as compact URIs (no `MEASURES`/`VOCABULARY`): `dfc-v:Held/Complete/Fulfilled/Unfulfilled/Combine`, `dfc-m:Kilogram/Piece/Euro/PoundSterling/USDollar` (`web/utils/currencyMeasureFor.js` maps codes).
- `connector.export(...)` spread → JSON string (async); `connector.import(string|object)` sync → array. No context juggling — `@context` always the v2 URL string.
- Known gaps: `SuppliedProduct` has `hasVariant` but no `isVariantOf` (registered manually via `registerSemanticProperty`); product types come from bundled v2 taxonomy (`dfc-pt:` notations) via `web/utils/productTypes.js` — v1 ids stored in DB may not resolve. (Fixed upstream: v2 `Price` now extends `QuantitativeValue`, so amount/currency flow through `value`/`hasUnit`.)

## Tests

- Jest `jest.config.js` (`ts-jest` + `babel-jest`, `transformIgnorePatterns:[]`, `testPathIgnorePatterns:['/node_modules/','acceptance-tests','e2e']`, `moduleNameMapper` resolves connector). `test-setup.js` closes `pool` after all.
- Mix `.spec.js`/`.test.js`. DB-dependent tests (`web/database/*`, `lineItemMappings.spec.js`) fail without Postgres.
- E2E: Playwright `playwright.config.js` (workers 1, `baseURL http://localhost:3080`, `global-setup/teardown`, `webServer` spawns `node index.js` in `web/` with `MOCK_BRIDGE=1`, `SHOPIFY_API_KEY=test-mock-key`). Needs `yarn --cwd web/frontend build` first unless using `test:e2e:build`.

## Gotchas

- Blank node IDs are global counter — `b1` in isolation becomes `b17` in full suite. Always copy `Received:` from the failing `npm test` run, don't generate in a standalone script.
- `HOST` trailing slash matters for products/orders (`${config.HOST}api/dfc/...` in `productUtils.js`, `dfc-order.js`); portals/scopes strip it via `.replace(/\/+$/,'')`. Ensure `.env` HOST ends with `/`.
- `web/database/build.js` requires existing `SHOP_REGISTRY_DATABASE_NAME` DB; `DATABASE_HOST_URL` without db name.
- Frontend changes need rebuild before `npm run test:e2e` (without `:build`).
- Stale `linkml-connector` branch holds a v2.0.0 migration against May-2026 code (91 commits behind) — reference only, don't cherry-pick blindly.
