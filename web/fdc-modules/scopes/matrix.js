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
 * | Route (mount)                             | GET                   | POST/PUT/PATCH/DELETE |
 * |-------------------------------------------|-----------------------|-----------------------|
 * | `/api/dfc/Enterprises`                     | open (portal-filtered) | —                     |
 * | `/api/dfc/Enterprises/:EnterpriseName`     | ReadEnterprise        | —                     |
 * | `/api/dfc/Enterprises/:E/SuppliedProducts` | ReadProducts          | WriteProducts         |
 * | `/api/dfc/Enterprises/:E/Orders`           | ReadOrders            | WriteOrders           |
 * | `/api/dfc/Enterprises/:E/Portals`          | (Shopify session)     | —                     |
 *
 * Member paths inherit their container's row, so
 * `…/SuppliedProducts/123` resolves like `…/SuppliedProducts` and
 * `…/Orders/42/orderLines/7` like `…/Orders`.
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

/**
 * Resolve the DFC scope a request needs, or null when the route+method is not
 * exposed (the caller answers 404 in that case — it must not fall back to a
 * read scope, or an unwritten route would silently become readable).
 *
 * Matching order, most specific first:
 *   1. exact key match
 *   2. full-pattern match (`/…/:EnterpriseName/SuppliedProducts`)
 *   3. longest container-prefix match, so a member path
 *      (`/…/SuppliedProducts/123`, `/…/Orders/42/orderLines/7`) inherits its
 *      container's row. This is the LDP rule — members are authorised through
 *      their container — and it is what the routers actually produce, since
 *      `checkScopePermissions` sits on the container mount.
 */
export const getRequiredScope = (path, method) => {
  if (!path) {
    return null;
  }

  // Express serves HEAD through the GET handlers, and the LDP Allow headers
  // advertise it, so HEAD must resolve with the same scope as GET — otherwise
  // an otherwise-authorised HEAD 404s on shops using portal-scope
  // authorization.
  const methodScopes = method === 'HEAD'
    ? SCOPE_MAPPING.GET
    : SCOPE_MAPPING[method];

  if (!methodScopes) {
    return null;
  }

  if (methodScopes[path]) {
    return methodScopes[path];
  }

  // A member path is `<container>/<id>[/<sub>...]`, so a pattern matches a
  // member when the container is followed by a separator. Test against the
  // pattern's regex, not the literal pattern: patterns contain
  // `:EnterpriseName`, which never appears in a real path.
  const containerPrefix = (pattern) =>
    new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}/`).test(`${path}/`);

  const exact = (pattern) =>
    new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(path);

  const rows = Object.entries(methodScopes);

  // Pass 1: a pattern that matches the path outright.
  const exactMatch = rows.find(([pattern]) => exact(pattern));
  if (exactMatch) {
    return exactMatch[1];
  }

  // Pass 2: longest container prefix, so `…/SuppliedProducts` cannot shadow a
  // more specific nested row.
  const containerMatch = rows
    .filter(([pattern]) => containerPrefix(pattern))
    .sort(([a], [b]) => b.length - a.length)[0];

  return containerMatch ? containerMatch[1] : null;
};

export default SCOPE_MAPPING;
