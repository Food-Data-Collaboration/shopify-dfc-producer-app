/**
 * Single source of truth for DFC authorization on the LDP surface.
 *
 * Two independent layers gate every DFC route:
 *
 *   1. `checkUserAccessPermissions` — OIDC token introspection, then the
 *      per-shop `users` table (status = approved by the shop owner). This is
 *      the *user-level* authorization the Shopify app adds on top of plain LDP.
 *   2. `checkScopePermissions`      — the hub's *client_id* must hold the DFC
 *      scope for this route+method, recorded in `portal_permissions`.
 *
 * Layer 2 is skipped for shops with the orders feature enabled: those shops
 * have granted the hub direct access to that specific shop, so the portal
 * scope table is not consulted (see `checkScopePermissions`).
 *
 * ## Route x method x scope matrix
 *
 * Paths are matched against the *mount* path (`app.use` base), so a member
 * route such as `.../SuppliedProducts/123` inherits its container's row.
 *
 * | Route (mount)                                   | GET             | POST          | PUT/PATCH/DELETE |
 * |-------------------------------------------------|-----------------|---------------|------------------|
 * | `/api/dfc/Enterprises`                           | open (filter by portal) | —     | —                |
 * | `/api/dfc/Enterprises/:EnterpriseName`           | ReadEnterprise  | —             | —                |
 * | `/api/dfc/Enterprises/:E/SuppliedProducts`       | ReadProducts    | WriteProducts | WriteProducts    |
 * | `/api/dfc/Enterprises/:E/Orders`                 | ReadOrders      | WriteOrders   | WriteOrders      |
 * | `/api/dfc/Enterprises/:E/Portals`                | (Shopify session) | —          | —                |
 *
 * Enterprises are read-only: an enterprise *is* a Shopify shop, so creating or
 * deleting one is a shop install/uninstall, which is outside an LDP write. The
 * router answers `405` with an `Allow` header for those methods.
 */

export const SCOPE_BASE =
  'https://github.com/datafoodconsortium/taxonomies/releases/latest/download/scopes.rdf#';

export const SCOPES = {
  ReadEnterprise: `${SCOPE_BASE}ReadEnterprise`,
  ReadProducts: `${SCOPE_BASE}ReadProducts`,
  ReadOrders: `${SCOPE_BASE}ReadOrders`,
  WriteProducts: `${SCOPE_BASE}WriteProducts`,
  WriteOrders: `${SCOPE_BASE}WriteOrders`,
  WriteEnterprise: `${SCOPE_BASE}WriteEnterprise`
};

const ENTERPRISES = '/api/dfc/Enterprises/:EnterpriseName';
const SUPPLIED_PRODUCTS = `${ENTERPRISES}/SuppliedProducts`;
const ORDERS = `${ENTERPRISES}/Orders`;

/**
 * Methods grouped by the scope they require. `checkScopePermissions` looks up
 * `SCOPE_MAPPING[method][path]`; an absent entry means the route+method is not
 * exposed and the request is rejected with 404.
 */
export const SCOPE_MAPPING = {
  GET: {
    [ENTERPRISES]: SCOPES.ReadEnterprise,
    [SUPPLIED_PRODUCTS]: SCOPES.ReadProducts,
    [ORDERS]: SCOPES.ReadOrders
  },
  POST: {
    [SUPPLIED_PRODUCTS]: SCOPES.WriteProducts,
    [ORDERS]: SCOPES.WriteOrders
  },
  PUT: {
    [SUPPLIED_PRODUCTS]: SCOPES.WriteProducts,
    [ORDERS]: SCOPES.WriteOrders
  },
  PATCH: {
    [SUPPLIED_PRODUCTS]: SCOPES.WriteProducts,
    [ORDERS]: SCOPES.WriteOrders
  },
  DELETE: {
    [SUPPLIED_PRODUCTS]: SCOPES.WriteProducts,
    [ORDERS]: SCOPES.WriteOrders
  }
};

/** Read scopes advertised on the WebID profile / `/api/scopes`. */
export const ADVERTISED_SCOPES = [
  SCOPES.ReadEnterprise,
  SCOPES.ReadProducts,
  SCOPES.ReadOrders,
  SCOPES.WriteProducts,
  SCOPES.WriteOrders
];

export default SCOPE_MAPPING;
