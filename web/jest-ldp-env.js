/**
 * Jest setup for the LDP discovery suite.
 *
 * `web/fdc-modules/ldp/discovery.spec.js` imports the real `web/app.js`, which
 * builds the Shopify API client at module load and throws unless
 * SHOPIFY_API_KEY / SHOPIFY_API_SECRET_KEY are present. Setting them inside the
 * spec is too late: babel-jest hoists requires above top-level statements, and
 * jest's per-file `process` is not the one `config.js` sees.
 *
 * A setupFile runs before any test module is imported, which is the only place
 * these are reliably in place. It mirrors what `npm run test:e2e:build` passes
 * on the command line.
 */
/**
 * NODE_ENV is forced rather than defaulted. Jest sets it to 'test' before
 * setupFiles run, and `web/shopify.js` only passes `apiSecretKey` to the
 * Shopify API client when NODE_ENV is exactly 'development' — so without this
 * the client throws "Missing values for: apiSecretKey" the moment anything
 * imports app.js. The value only affects the Shopify client's config branch.
 */
process.env.NODE_ENV = 'development';
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-mock-key';
process.env.SHOPIFY_API_SECRET_KEY = process.env.SHOPIFY_API_SECRET_KEY
  || 'test-mock-secret';
// MOCK_BRIDGE skips the PostgreSQL session storage, so importing app.js does
// not try to open a database connection.
process.env.MOCK_BRIDGE = '1';