/**
 * Tests for the DFC scope matrix.
 *
 * The matrix is the authorization contract for the whole LDP surface, so these
 * assert both directions: every route+method the app exposes has a scope, and
 * the route-pattern matching resolves the paths express actually produces
 * (including member paths that inherit their container's row).
 */
import { SCOPE_MAPPING, SCOPES, getRequiredScope, ADVERTISED_SCOPES } from './matrix.js';

const ENTERPRISES = '/api/dfc/Enterprises/:EnterpriseName';
const SUPPLIED_PRODUCTS = `${ENTERPRISES}/SuppliedProducts`;
const ORDERS = `${ENTERPRISES}/Orders`;

describe('scope URIs', () => {
  it('all point at the published DFC scopes taxonomy', () => {
    Object.values(SCOPES).forEach((scope) => {
      expect(scope).toMatch(
        /^https:\/\/github\.com\/datafoodconsortium\/taxonomies\/releases\/latest\/download\/scopes\.rdf#/
      );
    });
  });
});

describe('getRequiredScope', () => {
  it('maps the enterprise read to ReadEnterprise', () => {
    expect(getRequiredScope('/api/dfc/Enterprises/acme', 'GET')).toBe(SCOPES.ReadEnterprise);
  });

  it('maps product reads and writes to their respective scopes', () => {
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'GET'))
      .toBe(SCOPES.ReadProducts);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'POST'))
      .toBe(SCOPES.WriteProducts);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'PUT'))
      .toBe(SCOPES.WriteProducts);
  });

  it('gates PATCH and DELETE on products, not just POST and PUT', () => {
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'PATCH'))
      .toBe(SCOPES.WriteProducts);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'DELETE'))
      .toBe(SCOPES.WriteProducts);
  });

  it('gates order reads and writes separately', () => {
    expect(getRequiredScope('/api/dfc/Enterprises/acme/Orders', 'GET')).toBe(SCOPES.ReadOrders);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/Orders', 'POST')).toBe(SCOPES.WriteOrders);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/Orders', 'PUT')).toBe(SCOPES.WriteOrders);
  });

  it('resolves member paths to the container scope', () => {
    // checkScopePermissions matches on the app.use mount path, but a member
    // request must resolve to the same answer if it ever matched on the full
    // path instead.
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts/123', 'GET'))
      .toBe(SCOPES.ReadProducts);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/Orders/42', 'GET'))
      .toBe(SCOPES.ReadOrders);
  });

  it('returns null for a route+method combination the app does not expose', () => {
    // Enterprises are read-only, so no write scope may resolve for them, not
    // even for a path nested under the enterprise member URI.
    expect(getRequiredScope('/api/dfc/Enterprises/acme', 'POST')).toBeNull();
    expect(getRequiredScope('/api/dfc/Enterprises/acme', 'PUT')).toBeNull();
    expect(getRequiredScope('/api/dfc/Enterprises/acme', 'DELETE')).toBeNull();
  });

  it('falls back to the enterprise read scope for an unmapped sub-path', () => {
    // No such route is mounted today (Portals is Shopify-session auth, and is
    // deliberately absent from this matrix), so this documents the fallback
    // rather than a reachable behaviour: a GET of an unknown sub-resource is
    // treated as an enterprise read, and every write verb is still refused.
    expect(getRequiredScope('/api/dfc/Enterprises/acme/nonsense', 'GET'))
      .toBe(SCOPES.ReadEnterprise);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/nonsense', 'DELETE')).toBeNull();
  });

  it('returns null for an unsupported method rather than defaulting to read', () => {
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'TRACE')).toBeNull();
  });

  it('does not leak one container scope to a sibling container', () => {
    // A prefix match would wrongly let the Orders scope cover SuppliedProducts.
    expect(getRequiredScope('/api/dfc/Enterprises/acme/SuppliedProducts', 'GET'))
      .not.toBe(SCOPES.ReadOrders);
    expect(getRequiredScope('/api/dfc/Enterprises/acme/Orders', 'GET'))
      .not.toBe(SCOPES.ReadProducts);
  });
});

describe('ADVERTISED_SCOPES', () => {
  it('includes every scope the app actually enforces', () => {
    const enforced = new Set(Object.values(SCOPE_MAPPING).flatMap((byPath) => Object.values(byPath)));
    ADVERTISED_SCOPES.forEach((scope) => expect(enforced.has(scope)).toBe(true));
  });

  it('is unique, so the profile does not advertise a scope twice', () => {
    expect(new Set(ADVERTISED_SCOPES).size).toBe(ADVERTISED_SCOPES.length);
  });
});
