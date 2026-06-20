# AGENTS.md — shopify-dfc-producer-app

## Dev commands

| Command | What |
|---------|------|
| `npm test` | Jest scoped to `web/*` — source tests only (runs in-band, force-exit) |
| `npm run acceptance-test` | Jest scoped to `acceptance-tests/` (needs live server + OIDC) |
| `npm run build:db` | Build DB — runs `web/database/build.js` (central + per-shop schema) |
| `yarn dev` (root) | Start Shopify dev server (3 ports: 36327, 36328, 36329) |
| `cd web && yarn serve` | Production Express server |
| `npx jest --no-coverage path/to/test.spec.js` | Single test (run from root) |

## Repo conventions

- **`yarn` is used** for dependency management (root + `web/` both have `yarn.lock`). Both dirs need `yarn install`.
- **`web/` is ESM** (`"type": "module"`). Root `package.json` is CJS — jest.config.js uses `require.resolve`.
- **Node >=20.10.0** required (`web/package.json` engines).
- **Two `shopify.app.*.toml`** files exist (`alex`, `sonouno`) — per-developer Shopify App configs.
- `.env` lives in **`web/`** — `web/config.js` loads it via dotenv with yup validation.
- ESLint (airbnb base) + Prettier configured in `web/`.

## Tests

- Test files are a mix of `.spec.js` and `.test.js` across the tree.
- DB-dependent tests (`web/database/*`, `lineItemMappings.spec.js`) fail without a running PostgreSQL.
- Acceptance tests (`acceptance-tests/`) require a live Shopify app + OIDC credentials.
- Thesauri at `web/connector/thesaurus/` (4 JSON: facets, measures, productTypes, vocabulary). Loaded by connector singleton at init.
- Tests import `@datafoodconsortium/connector` directly — `moduleNameMapper` in root `jest.config.js` resolves the correct `node_modules`.

## Architecture

- **Entrypoint**: `web/app.js` (Express). Routes under `/api/dfc/Enterprises/:EnterpriseName/...`.
- **Connector singleton**: `web/connector/index.js` — async init, cached after first call. Thesauri loaded from local JSON via `import ... with { type: 'json' }`.
- **Key modules under `web/fdc-modules/`**: `orders/` (controllers + dfc transform), `enterprises/`, `products/`, `portals/`.
- **Newer API modules under `web/api-modules/`**: `products/`, `users/`, `shop/` — authenticated via Shopify session (not DFC scope).
- **Two routing systems**: legacy at `/fdc/` (via `web/legacy-fdc-modules/`), current at `/api/dfc/`.
- **Middleware stack** on DFC routes: `populateShop` → `checkUserAccessPermissions` → `checkOrdersFeature`/`checkScopePermissions` → handler.
- **Database**: Multi-tenant PostgreSQL. Central `shop_registry` maps shop_name → db_name. `web/database/connect.js` creates per-shop pools via `getShopDbConnection(shopId)`. SSL with `rejectUnauthorized: false`.
- **Local DB**: `local-db/docker-compose.yml` — PostgreSQL on port 5435 + pgAdmin on 5050.
- **Config** (`web/config.js`): validates `HOST`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET_KEY`, `OIDC_*`, `DATABASE_HOST_URL`, `SHOP_REGISTRY_DATABASE_NAME` via yup.
- **Docker**: `Dockerfile` copies only `web/` into the image, runs `yarn` + frontend build.
- **CI/CD**: GitHub Actions (`.github/workflows/`). `build-and-deploy.yml` is a reusable workflow: builds Docker image, pushes to `ghcr.io`, redeploys on Jelastic. `deploy-staging.yml` triggers on `staging` branch → `ofn-producer-staging`. `deploy-main.yml` triggers on `main` → `ofn-producer`. Neither has run yet.

## Connector API (`@datafoodconsortium/connector`)

- Both root and `web/` install from npm: `^1.0.0-alpha.12`.
- Default import path: `@datafoodconsortium/connector` (NOT `@fooddatacollaboration/linkml-connector` — that's on the `linkml-connector` branch).
- Object creation uses named-param objects: `new Order({ connector, semanticId, ... })` / `connector.createQuantity({ value, hasUnit })`.
- Property access via getters: `obj.getSemanticId()`, `obj.getOrderStatus()`, `obj.getQuantity()`.
- Vocabulary constants via `connector.VOCABULARY.STATES.ORDERSTATE.*`.
- `connector.export(array)` takes an array; `connector.import(string)` is async (returns array).
- `line.getOffer()` returns an Offer; `offer.getOfferedItem()` returns a SuppliedProduct.

## Migration branch

`linkml-connector` branch has a full migration to `@fooddatacollaboration/linkml-connector` v2.0.0. The API is substantially different (field-based access, spread export, compact URIs). If working on that branch, see its version of this file for the new conventions.

## Beta.2 upgrade notes

Upgrading `@datafoodconsortium/connector` from alpha.12 to beta.2 is a **breaking change**. Verified via test failures on this repo:

- **`connector.export()` context URI changed** — beta.2 outputs `https://www.datafoodconsortium.org/wp-content/plugins/wordpress-context-jsonld/context_1.16.0.jsonld`, not the `w3id.org` URI.
- **Blank node IDs doubled** — export produces `_:_:b10` instead of `_:b10`.
- **Semantic IDs lose HOST** — `HOST` env var is no longer picked up; export produces `undefinedapi/dfc/...` instead of `http://localhost:3629/api/dfc/...`.
- **Status properties flattened** — `hasOrderStatus` and `hasFulfilmentStatus` are now plain strings (`"dfc-v:Held"`) instead of `{"@id":"dfc-v:Held"}` objects.
- **`lineItems` shape changed** — no longer an array; code using `.reduce()` on it will break.
- **Currency mapping changed** — tests get `Unknown connector currency mapping for currenct code undefined`.

Files that need updating: `web/fdc-modules/orders/dfc/dfc-order.js`, `web/connector/productUtils.js`, `web/connector/mocks.js`, and all corresponding test files.
