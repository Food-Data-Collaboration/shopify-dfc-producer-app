# AGENTS.md — shopify-dfc-producer-app

## Setup

- Node >=20.10.0 (`web/package.json` engines). `web/` is ESM (`"type": "module"`), root is CJS.
- Install: `yarn install` at root, then `yarn install` in `web/` and `web/frontend/` (3 lockfiles). `yarn` only — `package-lock.json` appears after install and is tracked, don't delete.
- Env: `web/.env` (not root). Validated by `web/config.js` via yup (`HOST`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET_KEY`, `OIDC_*`, `DATABASE_HOST_URL`, `SHOP_REGISTRY_DATABASE_NAME`). `shopify.app.*.toml` per-developer configs exist.
- DB local: `local-db/docker-compose.yml` (postgres 5435 + pgAdmin 5050). Build schema: `npm run build:db` (runs `web/database/build.js` — connects to `SHOP_REGISTRY_DATABASE_NAME`).

## Commands

| Command | Notes |
|---------|-------|
| `yarn dev` (root) | Shopify CLI dev — 3 ports `36327/36328/36329` (`cross-env SERVER_PORT/FRONTEND_PORT/BACKEND_PORT`). Use `--reset` on first run. |
| `cd web && yarn serve` | Production Express server |
| `npm test` | `jest --runInBand --detectOpenHandles --forceExit web/*` — excludes `acceptance-tests/` and `e2e/` |
| `npx jest --no-coverage path/to/file.spec.js` | Single test (from root) — captures blank-node `Received:` from full suite |
| `npm run acceptance-test` | `web/*` excluded, targets `acceptance-tests/` — needs live server + OIDC |
| `npm run test:e2e:build` | Builds `web/frontend` (`vite build`), starts server `MOCK_BRIDGE=1`, mock admin on 3080, runs Playwright |
| `npm run build:db` | `node ./web/database/build.js` |
| ESLint/Prettier | Configured in `web/.eslintrc.cjs` (airbnb base). No separate typecheck. |

## Architecture

- Entrypoint `web/app.js` (Express). Routes:
  - `/api/dfc/Enterprises/:EnterpriseName/{Orders,SuppliedProducts,Portals}` — DFC API (JSON-LD via `express.text({type:'*/json'})`)
  - `/api/{products,hub-users,shop}` — Shopify-session APIs (`shopify.validateAuthenticatedSession()` + `checkOnlineSession`)
  - `/fdc` — legacy (`web/legacy-fdc-modules/`)
  - `/api/scopes` — unauthenticated
- Middleware stack DFC: `populateShop` → `checkUserAccessPermissions` → `checkOrdersFeature`/`checkScopePermissions` → handler.
- Modules: `web/fdc-modules/{orders,enterprises,products,portals}` (controllers + `dfc/` transforms), `web/api-modules/{products,users,shop}`, `web/legacy-fdc-modules/`.
- DB multi-tenant: central `shop_registry` → per-shop pools via `web/database/connect.js:getShopDbConnection(shopId)`, SSL `rejectUnauthorized:false`. Schema per module (`web/database/{shop_registry,orders,portals,users,...}/schema.sql`); `migrations.sql` + `auto-timestamp.sql`.
- Config: `web/config.js` loads `web/.env` (handles cwd `web` vs root).
- Connector singleton `web/connector/index.js` — lazy, cached. Loads 4 JSON thesauri (`facets/measures/productTypes/vocabulary`) via `import ... with {type:'json'}`. Sets `exporter.outputContext` to `DFC_CONTEXT_W3ID`; `dfcContext.js:normalizeContext()` swaps wordpress `context_1.16.0.jsonld` ↔ `w3id.org` on import.
- Frontend `web/frontend/` — Vite + React + Polaris, `vite build` → `web/frontend/dist`, served by Express static. `dev_embed.js` for Shopify.
- Docker `Dockerfile` copies only `web/` then `yarn` + frontend build. CI `build-and-deploy.yml` (reusable, pushes `ghcr.io`), `deploy-staging.yml` (staging branch), `deploy-main.yml` (main).

## Connector `@datafoodconsortium/connector` (1.0.0-beta.2)

- Installed at root and `web/` as `^1.0.0-beta.2`. Import `@datafoodconsortium/connector` (not `linkml-connector` — that's `linkml-connector` branch with `v2.0.0` breaking API).
- Creation: `new Order({connector, semanticId, ...})` / `connector.createQuantity({value, hasUnit})` / `connector.createOffer({semanticId, offeredItem})`.
- Access via getters: `getSemanticId()`, `getOrderStatus()`, `getQuantity()`, `line.getOffer().getOfferedItem()`.
- Vocab: `connector.VOCABULARY.STATES.ORDERSTATE.*`, `connector.MEASURES.UNIT.CURRENCYUNIT.*` (wrap via `web/utils/currencyMeasureFor.js`).
- `connector.export(array)` → JSON-LD string, `connector.import(string)` async → array (filter `instanceof Order/OrderLine/SaleSession`).
- Beta.2 quirks: blank nodes `_:bN` (old staging `beta.2` republish used `_:_:bN`); `orderStatus`/`fulfilmentStatus` may be plain string vs `{"@id":...}` — see `normalizeContext`; `HOST` must be explicit in semanticIds (`config.HOST`).

## Tests

- Jest `jest.config.js` (`ts-jest` + `babel-jest`, `transformIgnorePatterns:[]`, `testPathIgnorePatterns:['/node_modules/','acceptance-tests','e2e']`, `moduleNameMapper` resolves connector). `test-setup.js` closes `pool` after all.
- Mix `.spec.js`/`.test.js`. DB-dependent tests (`web/database/*`, `lineItemMappings.spec.js`) fail without Postgres.
- E2E: Playwright `playwright.config.js` (workers 1, `baseURL http://localhost:3080`, `global-setup/teardown`, `webServer` spawns `node index.js` in `web/` with `MOCK_BRIDGE=1`, `SHOPIFY_API_KEY=test-mock-key`). Needs `yarn --cwd web/frontend build` first unless using `test:e2e:build`.
- CI gates deploy: Playwright suite must pass before Docker build.

## Gotchas

- Blank node IDs are global counter — `b1` in isolation becomes `b17` in full suite. Always copy `Received:` from the failing `npm test` run, don't generate in a standalone script.
- `HOST` trailing slash matters: `${config.HOST}api/dfc/...` — ensure `.env` HOST ends with `/`.
- `web/database/build.js` requires existing `SHOP_REGISTRY_DATABASE_NAME` DB; `DATABASE_HOST_URL` without db name.
- Frontend changes need rebuild before `npm run test:e2e` (without `:build`).
- `linkml-connector` branch API differs (field access, spread export, compact URIs) — don't apply main-branch connector patterns there.
