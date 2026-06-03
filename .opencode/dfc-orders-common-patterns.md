# DFC Orders — Cross-Platform Patterns

Comparing the shopify-dfc-producer-app (Shopify) and the Open Food Network (OFN) DFC implementations. Shopify has a working order API; OFN added order endpoints in [PR #13208](https://github.com/openfoodfoundation/openfoodnetwork/pull/13208) (20 files, +698/−20). Both use `@datafoodconsortium/connector`.

---

## 1. Connector initialisation

**Pattern**: Singleton, loaded once with thesauri/vocabularies at startup.

| Shopify | OFN |
|---------|-----|
| `web/connector/index.js`: lazy async singleton. `new Connector()`, then `loadFacets`, `loadMeasures`, `loadProductTypes`, `loadVocabulary` from local JSON. | `DfcLoader.connector`: `Connector.instance`, then `loadMeasures`, `loadFacets`, `loadProductTypes`, `vocabulary` from local JSON in `vendor/`. |
| JS: `import ... with { type: 'json' }` | Ruby: `JSON.parse(Rails.root.join(...).read)` |

**Rule**: Initialise the connector once. Load all four thesaurus files (facets, measures, productTypes, vocabulary) before use. Cache and reuse.

---

## 2. Semantic ID construction

**Pattern**: All DFC resource IDs follow `{HOST}/api/dfc/...` with platform-specific path segments.

| Resource | Shopify | OFN |
|----------|---------|-----|
| Enterprise | `{HOST}/api/dfc/Enterprises/{name}` | Engine route: `/api/dfc/enterprises/{id}` |
| SuppliedProduct | `{HOST}/.../Enterprises/{name}/SuppliedProducts/{variantId}` | Enterprise sub-resource: `.../enterprises/{id}/supplied_products/{variantId}` |
| Order | `{HOST}/.../Enterprises/{name}/Orders/{orderId}` | `{HOST}/.../enterprises/{id}/orders/{orderId}` (PR #13208 route) |
| OrderLine | `{HOST}/.../Orders/{orderId}/orderLines/{externalId}` | `{HOST}/.../orders/{orderId}/OrderLines/{lineItemId}` (no separate route; embedded in Order) |
| Offer | `{HOST}/.../Offers/{variantId}` (made-up) or attached to SuppliedProduct | Enterprise sub-resource: `.../enterprises/{id}/offers/{variantId}` |

**Rule**: Semantic IDs must be absolute URLs under the platform's configured `HOST`. Order resources nest under `Enterprises/{name}/Orders/{id}/orderLines/{lineId}`.

---

## 3. Parsing inbound DFC graphs

**Pattern**: `connector.import(jsonld)` → array; filter by type. Validate exactly 1 Order, matching line count, and (for creation) exactly 1 SaleSession.

---

## 4. Mapping DFC lines → platform orders

**Pattern**: A DFC OrderLine references an Offer → SuppliedProduct. The platform must resolve that to its own variant/product ID.

```
DFC OrderLine
  └─ getOffer()
       └─ getOfferedItem()   → SuppliedProduct
            └─ getSemanticId() → "http://.../SuppliedProducts/49889697366289"
                                                          └─ numeric ID
```

Both platforms extract the numeric ID from the semantic ID's last path segment:

| Shopify | OFN |
|---------|-----|
| `ids.js`: `shopifyId.toString().substring(shopifyId.toString().lastIndexOf('/') + 1)` | Implicit in URL routing (Rails `params[:id]`) |

**Rule**: Store the platform's variant/product ID in the last segment of the SuppliedProduct semantic ID. Extract via last-path-segment parsing.

---

## 5. Order status mapping

**Pattern**: Translate platform-native order status to DFC vocabulary constants.

```
connector.VOCABULARY.STATES.ORDERSTATE.*
connector.VOCABULARY.STATES.FULFILMENTSTATE.*
```

| Shopify DraftOrder → DFC | OFN Spree Order → DFC |
|--------------------------|-----------------------|
| OPEN → HELD | (not yet implemented) |
| INVOICE_SENT → HELD | |
| COMPLETED → COMPLETE | |

---

## 6. Constructing DFC order responses

**Pattern**: Create connector objects, wire them together, then `connector.export(array)`.

Both platforms build the same object graph for an order:

```
Order
 ├── OrderStatus (dfc:Heled / dfc:Complete)
 ├── FulfilmentStatus
 └── OrderLine (×N)
      ├── quantity
      ├── Offer
      │    └── offeredItem → SuppliedProduct
      └── Price
           ├── value
           └── unit (currency measure)
```

Additional objects for wholesale/variant structure:

```
AsPlannedConsumptionFlow
AsPlannedProductionFlow
AsPlannedTransformation
```

Shopify emits these; OFN doesn't (no variant-pair mapping in orders yet).

**Rule**: `connector.export(array)` must receive a flat array of all objects in the graph. The connector handles serialisation to JSON-LD.

---

## 7. Mapping SaleSession / reservation dates

**Pattern**: A DFC SaleSession provides the reservation window (beginDate, endDate). The `endDate` becomes the Shopify `reserveInventoryUntil`.

| Shopify | OFN |
|---------|-----|
| `saleSession.getEndDate()` → ISO string → Shopify `reserveInventoryUntil` | `SaleSessionBuilder.build(order_cycle)` reads `orders_open_at` / `orders_close_at` |
| Persisted to `sales_sessions` table | Not persisted (builder-only) |

**Rule**: SaleSession is required for order creation. Its endDate maps to the platform's inventory reservation deadline.

---

## 8. Line item identity management

**Pattern**: The platform's internal line item IDs differ from the DFC's. A mapping table links them.

Shopify uses a `line_items` table in the per-shop DB:
```
external_id (serial PK) → used in DFC semantic ID
shopify_id              → Shopify line item node ID
variant_id              → ProductVariant ID
order_id                → DraftOrder ID
```

OFN doesn't yet expose order lines via DFC, but its Spree `line_items` table maps to the same concepts.

**Rule**: Maintain a persistent mapping between DFC-external line IDs and platform-internal line IDs. The `external_id` goes into the semantic ID URL.

---

## 9. Authorisation layering

**Pattern**: DFC orders sit behind OIDC authentication + scope-based permissions.

| Layer | Shopify | OFN |
|-------|---------|-----|
| Auth | OIDC Bearer token validated against `OIDC_ISSUER` | JWT decoded with known public keys; also supports API tokens |
| Enterprise access | `populateShop` → `checkUserAccessPermissions` (validates token, sets `req.user`, `req.shopName`, `req.shop`) | `AuthorizationControl` → resolves user + enterprise; `check_authorization` before_action |
| Feature flag | `checkOrdersFeature`: checks `shops.orders_feature_enabled` | (not applicable yet) |
| Scope | `checkScopePermissions`: checks `portal_permissions` for OIDC `client_id` + required scope URI | `require_permission(scope)` checks permission records |
| Scope URIs | `ReadOrders`, `WriteOrders` from scopes.rdf | Well-known only exposes `ReadEnterprise`, `ReadProducts` |

---

## 10. Connector vocabulary references

**Pattern**: Both platforms use `connector.VOCABULARY.STATES.ORDERSTATE.*` and `FULFILMENTSTATE.*`. Path is identical in JS and Ruby.

---

## 11. Wholesale / variant pairing

**Pattern**: Products can have multiple variants (retail + wholesale) linked through `AsPlannedConsumptionFlow` / `AsPlannedProductionFlow` / `AsPlannedTransformation`.

| Shopify | OFN |
|---------|-----|
| `fdc_variants` table: `wholesale_variant_id`, `retail_variant_id`, `no_of_items_per_package` | `DfcCatalog` handles wholesale price/stock adjustments via `FdcOfferBroker` |
| Flows created per variant pair at export time | Not encoded in builder objects yet |

**Rule**: When the platform supports variant pairing, express it through the DFC flow objects (ConsumptionFlow → ProductionFlow → Transformation). Include `no_of_items_per_package` as the quantity on the flow edges.

---

## 12. Currency handling

**Pattern**: DFC measures define a small set of currency units. The platform maps its currency code to the matching measure.

| Shopify | OFN |
|---------|-----|
| `currencyMeasureFor(connector, currencyCode)` — custom function | `OfferBuilder.price_measure(variant)` — maps ISO 4217 to measure |
| Both use: `AUD`, `CAD`, `EUR`, `GBP`, `USD` | Same set (limited by DFC taxonomy) |

**Rule**: Currency must be mapped from the platform's native representation to the DFC measure object. Both platforms use the same 5-currency mapping.

---

## Summary of implementation status

| Capability | Shopify | OFN |
|------------|---------|-----|
| Enterprise (read) | ✅ | ✅ |
| SuppliedProducts (CRUD) | ✅ | ✅ |
| CatalogItems (read/update) | ✅ | ✅ |
| Offers (read/update) | ✅ | ✅ |
| **Orders (create)** | **✅** | **✅** (PR #13208) |
| **Orders (read)** | **✅** | **✅** (PR #13208) |
| **Orders (update)** | **✅** | **Not implemented** |
| **OrderLines (CRUD)** | **✅** | **Partial** (built as embedded objects in Order show/create) |
| SaleSessions | ✅ | ✅ (`SaleSessionBuilder.build(order_cycle)` in controller; not persisted) |
| Fulfilment status | ✅ | Not implemented |
| Wholesale flows | ✅ | Via catalog broker |
| DFC v2 migration | `linkml-connector` branch | `render_v2` path exists |

---

## Appendix: PR #13208 files (OFN)

20 files (+698/−20). Key architectural notes: simpler than Shopify — uses `distributed_orders.build()`, 1:1 status mapping (`HELD → complete`), no scope/per-route middleware (only `check_enterprise`), SaleSession reads from DB (`order_cycle`), variant ID extracted via `/supplied_products/` string split.

| File | Δ |
|------|---|
| `engines/dfc_provider/app/controllers/dfc_provider/orders_controller.rb` | **NEW** — show + create; parse DFC graph, build/save order, render JSON-LD |
| `engines/dfc_provider/spec/requests/orders_spec.rb` | **NEW** — show (200/401/404), create (201/400/401/404/422) |
| `engines/dfc_provider/spec/system/orders_backorder_spec.rb` | **NEW** — integration: backorder → supplier order → cycle completion sync |
| `engines/dfc_provider/spec/system_helper.rb` | **NEW** — load OFN base helpers for engine |
| `spec/fixtures/files/fdc-send-backorder.json` | **NEW** — example JSON-LD request |
| `engines/dfc_provider/config/routes.rb` | +orders route |
| `engines/dfc_provider/app/services/order_builder.rb` | +build, apply, build_order_lines, order_states |
| `engines/dfc_provider/app/services/order_line_builder.rb` | +build(dfc_order, line_item); build_from_offer renamed |
| `engines/dfc_provider/app/services/offer_builder.rb` | +add_offered_item |
| `engines/dfc_provider/app/services/dfc_builder.rb` | +include_product param |
| `engines/dfc_provider/app/services/supplied_product_builder.rb` | +catalogItems ref |
| `engines/dfc_provider/spec/services/order_builder_spec.rb` | +specs for build + apply |
| `app/services/fdc_url_builder.rb` | Support OFN lowercase paths |
| `app/services/fdc_backorderer.rb` | Use renamed build_from_offer |
| `app/models/spree/stock/availability_validator.rb` | Handle nil variant |
| `spec/services/fdc_url_builder_spec.rb` | Test OFN URL construction |
| `spec/models/spree/stock/availability_validator_spec.rb` | Test nil variant |
| `spec/system/support/cuprite_setup.rb` | Set engine URL options for system tests |
| `engines/dfc_provider/spec/requests/supplied_products_spec.rb` | Update fixture IDs |
| `swagger/dfc.yaml` | +order endpoint specs |
