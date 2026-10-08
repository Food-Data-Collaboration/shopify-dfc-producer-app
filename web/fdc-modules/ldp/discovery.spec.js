/**
 * Tests for LDP discovery (OPTIONS) on the DFC routes.
 *
 * This is a regression suite for two defects that made every OPTIONS response
 * useless to a hub:
 *
 *   1. `cors()` answers OPTIONS itself and, with the default
 *      `preflightContinue: false`, never calls next() — so an `ldpOptions`
 *      handler behind a bare `cors()` was dead code and no client ever
 *      received `Allow`, `Link` or `Accept-Post`.
 *   2. even with the preflight fixed, the handlers lived inside the routers,
 *      behind `populateShop`/`checkOrdersFeature`. `populateShop` answers 404
 *      for an unknown shop, and a hub asking "what can I do here?" cannot
 *      supply a valid one — so discovery 404'd.
 *
 * The routes are therefore mounted ahead of the `app.use` middleware chain.
 * Neither defect was visible to the unit tests, which exercise the handlers
 * directly; this suite loads the real Express app.
 */
const ENTERPRISES = '/api/dfc/Enterprises';
const BASE = '/api/dfc/Enterprises/acme';

// The Shopify API keys and MOCK_BRIDGE come from web/jest-ldp-env.js (a jest
// setupFile), which runs before any module is imported — the only place they
// are reliably set, because babel-jest hoists requires above top-level
// statements and jest gives each file its own `process`.
const { default: app } = require('../../app.js');

let server;
let origin;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

const discover = async (path) => {
  const response = await fetch(`${origin}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://hub.example',
      'Access-Control-Request-Method': 'POST'
    }
  });

  return {
    status: response.status,
    allow: response.headers.get('allow'),
    acceptPost: response.headers.get('accept-post'),
    acceptPatch: response.headers.get('accept-patch'),
    link: response.headers.get('link'),
    corsOrigin: response.headers.get('access-control-allow-origin')
  };
};

describe('LDP discovery', () => {
  it('answers 200 with Allow and Link, not a bare 204', async () => {
    // A 204 with no headers is what a client cannot act on; every one of these
    // used to come back empty.
    const { status, allow, link } = await discover(`${ENTERPRISES}`);

    expect(status).toBe(200);
    expect(allow).toBe('GET, HEAD, OPTIONS');
    expect(link).toContain('ldp#Container');
  });

  it('does not advertise Accept-Post on the read-only Enterprises container', async () => {
    const { acceptPost } = await discover(`${ENTERPRISES}`);
    expect(acceptPost).toBeNull();
  });

  it('advertises POST on the writable SuppliedProducts container', async () => {
    const { status, allow, acceptPost } = await discover(`${BASE}/SuppliedProducts`);

    expect(status).toBe(200);
    expect(allow).toBe('GET, POST, HEAD, OPTIONS');
    expect(acceptPost).toBe('application/ld+json');
  });

  it('advertises PUT/PATCH/DELETE on a SuppliedProducts member', async () => {
    const { status, allow, acceptPatch, acceptPost } = await discover(
      `${BASE}/SuppliedProducts/42`
    );

    expect(status).toBe(200);
    expect(allow).toBe('GET, PUT, PATCH, DELETE, HEAD, OPTIONS');
    expect(acceptPatch).toBe('application/ld+json');
    expect(acceptPost).toBeNull();
  });

  it('discovers the Orders container and its members without a database hit', async () => {
    // "acme" is not a registered shop, so anything reaching populateShop would
    // 404 here.
    const container = await discover(`${BASE}/Orders`);
    expect(container.status).toBe(200);
    expect(container.allow).toBe('GET, POST, HEAD, OPTIONS');

    const member = await discover(`${BASE}/Orders/9`);
    expect(member.status).toBe(200);
    expect(member.allow).toBe('GET, PUT, PATCH, DELETE, HEAD, OPTIONS');

    const lines = await discover(`${BASE}/Orders/9/orderLines`);
    expect(lines.status).toBe(200);

    const line = await discover(`${BASE}/Orders/9/orderLines/3`);
    expect(line.status).toBe(200);
    expect(line.acceptPatch).toBe('application/ld+json');
  });

  it('still carries the CORS headers a browser client needs', async () => {
    const { corsOrigin } = await discover(`${BASE}/SuppliedProducts`);
    expect(corsOrigin).toBe('*');
  });
});