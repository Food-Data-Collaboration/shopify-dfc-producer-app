# DFC Orders — Logic Flow

## Route layout

All routes are mounted at `/api/dfc/Enterprises/:EnterpriseName/Orders` in `web/app.js:92-101`.

```js
Router({ mergeParams: true })
  GET   /                          → getAllOrders
  POST  /                          → create
  GET   /:id                       → get
  PUT   /:id                       → update
  GET   /:id/orderLines            → getOrderLines
  POST  /:id/orderLines            → createOrUpdateOrderLine
  GET   /:id/orderLines/:lineId    → getOrderLine
  PUT   /:id/orderLines/:lineId    → createOrUpdateOrderLine
```

## Middleware chain (applied before each handler)

```
cors()
express.text({ type: '*/json' })
populateShop           — parses enterprise name → shop name
checkUserAccessPermissions  — validates OIDC token, sets req.user.id
checkOrdersFeature    — checks shops.orders_feature_enabled in shop_registry DB
checkScopePermissions — checks portal_permissions for OIDC client_id + required scope
```

## Inbound flow (DFC JSON-LD → Shopify Draft Order)

### POST / (create)

1. **Parse DFC graph** — `extractOrderAndLinesAndSalesSession(req.body)` via `dfc-order.js:21`:
   - Loads connector singleton
   - `connector.import(payload)` → deserialises JSON-LD
   - Filters for `Order`, `OrderLine`, `SaleSession` instances
   - Validates exactly 1 Order, matching line count, exactly 1 SaleSession
   - Returns `{ order, saleSession }`

2. **Resolve customer** — GraphQL `customers(query: "email:...")`. Returns 403 if none found.

3. **Convert DFC lines → Shopify lines** — `dfcLineToShopifyLine(dfcLine)`:
   - `line.getOffer()` → `offer.getOfferedItem()` → extract numeric ID from semantic ID's last segment
   - Returns `{ variantId: "gid://shopify/ProductVariant/...", quantity }`

4. **Create Shopify Draft Order** — GraphQL `draftOrderCreate` mutation (tag: `fdc`, pay-on-receipt).

5. **Persist local metadata** — `createDraftOrder` + `createSalesSession` in per-shop DB.

6. **Map line item IDs** — `persistLineIdMappings`: extracts shopify line ID + variant ID, upserts into `line_items` table with auto-generated `external_id`. Returns `[{ externalId, shopifyId, variantId }]`.

7. **Build DFC response** — `createDfcOrderFromShopify`: builds connector objects (SuppliedProduct, Offer, OrderLine, Order, price, quantity), maps statuses, `connector.export(graph)`. Semantic IDs use `{HOST}/api/dfc/Enterprises/{name}/Orders/{id}/...`.

### PUT /:id (update)

1. **Authorise** — verify order belongs to calling user.
2. **Parse** — `extractOrderAndLines(req.body)` (no SaleSession for update).
3. **Fetch current Shopify draft** + load sales session.
4. **Update draft** — maps DFC lines → Shopify lines (filters 0-quantity), `draftOrderUpdate` mutation. If status → COMPLETE: calls `completeDraftOrder` (retries up to 10× × 300ms) then updates DB.
5. **Re-persist mappings + respond** — same as create.

### GET /:id (get single order)

1. **Authorise**, fetch from Shopify via `draftOrder(id)`, load line mappings.
2. **Build DFC response** — `createDfcOrderFromShopify(order, mappings, enterprise)`.

### GET / (list all orders)

1. **Resolve customer** — empty if none found.
2. **Load all line mappings** grouped by `draftOrderId`.
3. **Fetch Shopify drafts** — `draftOrders(query: "tag:fdc AND customer_id:{id}", pagination)`.
4. **Build bulk response** — iterate drafts with mappings, `connector.export(flatMegaGraph)`.

## Order lines sub-routes

### POST+PUT /:id/orderLines[/:lineId] (create or update)

1. **Authorise**, parse single `OrderLine` from body, fetch current draft.
2. **Merge lines** — iterate existing line items; if variant matches, replace (update qty); otherwise append.
3. **Update draft** + re-persist mappings + respond with single line.

### GET /:id/orderLines (list lines) & GET /:id/orderLines/:lineId (single line)

Authorise, fetch, load mappings, build DFC response. Single-line endpoint resolves `externalId → shopifyId` via mappings first.

## Database tables (per-shop DB)

| Table | Columns | Notes |
|-------|---------|-------|
| `orders` | `draft_order_id` (bigint PK), `completed_order_id` (bigint NULL), `owner_id` (FK) | Shopify DraftOrder + OIDC user |
| `line_items` | `external_id` (serial PK), `shopify_id`, `variant_id`, `order_id` (FK) | UNIQUE(order_id, variant_id). `external_id` used in DFC semantic IDs |
| `sales_sessions` | `shopify_order_id` (bigint UNIQUE FK), `reservation_date` (TEXT) | ISO date from SaleSession.endDate |
| `fdc_variants` | `wholesale_variant_id`, `retail_variant_id`, `product_id`, `no_of_items_per_package`, `enabled` (bool) | UNIQUE(product_id, retail_variant_id). Wholesale variant mapping |

### `shops` (registry DB — cross-shop)
`orders_feature_enabled` must be true for order routes to work.

## DFC ↔ Shopify status mapping

| Shopify DraftOrder status | DFC OrderState |
|---------------------------|----------------|
| OPEN                      | HELD          |
| INVOICE_SENT              | HELD          |
| COMPLETED                 | COMPLETE      |

| Shopify fulfilment status | DFC FulfilmentState |
|--------------------------|---------------------|
| FULFILLED               | FULFILLED          |
| IN_PROGRESS             | UNFULFILLED        |
| ON_HOLD                 | HELD               |
| OPEN                    | UNFULFILLED        |
| PARTIALLY_FULFILLED     | UNFULFILLED        |
| PENDING_FULFILLMENT     | UNFULFILLED        |
| RESTOCKED               | UNFULFILLED        |
| SCHEDULED               | HELD               |
| UNFULFILLED             | UNFULFILLED        |


