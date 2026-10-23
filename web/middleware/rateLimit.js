/**
 * Rate limiting for the public DFC API, backed by `express-rate-limit`.
 *
 * Why this exists: `checkUserAccessPermissions` introspects an OIDC token on
 * every request (a network round trip to the identity provider) before it
 * decides anything. Without a limit, an unauthenticated caller can drive that
 * into a request-amplification loop against both us and the IdP — which is
 * what CodeQL flags as "route performs authorization but is not rate-limited".
 *
 * This used to be a hand-rolled fixed-window counter. It was replaced with
 * `express-rate-limit` for one concrete reason: CodeQL's
 * `js/missing-rate-limiting` query only recognises a fixed set of npm
 * limiters (`express-rate-limit`, `express-brute`, `express-limiter`,
 * `rate-limiter-flexible`, `fastify-rate-limit`), matching on the import, and
 * a custom middleware can never satisfy it however correct it is. The library
 * is the same in-memory fixed window the hand-rolled version implemented, and
 * it adds the IPv6 subnet handling described at `clientKey`.
 *
 * Per-process state: correct for a single-instance deployment, and each
 * replica enforces its own budget when scaled. Swap the store for Redis if
 * that matters; the middleware signature does not need to change.
 */
import { ipKeyGenerator } from 'express-rate-limit';

/** Window length. Long enough not to break a hub crawling a container. */
const DEFAULT_WINDOW_MS = 60_000;

/** Requests allowed per window per client identity. */
const DEFAULT_MAX = 120;

/**
 * Identify the caller, for bucket keying only — never for authorization.
 *
 *   1. The OIDC `client_id`, when the token has already been introspected.
 *      This is the real consumer and grouping by it is what makes the budget
 *      fair between hubs behind one NAT.
 *   2. The remote address, for everything else.
 *
 * There is deliberately no middle option keyed on a claim read out of the
 * bearer token. The limiter is mounted *before* `checkUserAccessPermissions`,
 * so on the request path that actually matters the token is still unverified
 * and every claim in it is attacker-controlled: an unsigned token carrying a
 * fresh `sub` per request would mint a fresh bucket per request and defeat the
 * limit entirely, while also growing the store unboundedly. Keying such
 * traffic on the address is the only choice that cannot be steered by the
 * caller.
 *
 * The cost is that hubs sharing an address share a budget. That is the correct
 * trade while the token is unverified: one address is one network location,
 * and a per-`client_id` split becomes available as soon as introspection runs.
 *
 * The address is passed through `ipKeyGenerator`, the library's IPv6-aware
 * normaliser. Left raw, a caller holding a /64 has 2^64 addresses and can mint
 * a fresh bucket with each; the helper collapses an IPv6 client to its /56
 * subnet. IPv4 addresses come back unchanged.
 */
const clientKey = (req) => {
  if (req.tokenSet?.client_id) {
    return `client:${req.tokenSet.client_id}`;
  }

  const address = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ipKeyGenerator(address)}`;
};

/** RFC 7807 body for a limited request, plus the headers a client retries on. */
const limitedResponse = (req, res, _next, options) => {
  const status = options.statusCode || 429;
  const retryAfter = Math.ceil(options.windowMs / 1000);

  res.set('Retry-After', String(retryAfter));
  res.set('Vary', 'Accept, Authorization');

  return res.status(status).json({
    type: 'about:blank',
    title: 'Too many requests',
    status,
    detail: `Rate limit exceeded. Retry after ${retryAfter}s.`
  });
};

/**
 * Options for `express-rate-limit`. Kept here rather than inline at the mount
 * site so the limiter's identity (`clientKey`, problem document) has one home.
 *
 * @param {object} [options]
 * @param {number} [options.windowMs] window length in ms
 * @param {number} [options.max] requests allowed per window per client
 * @param {Function} [options.onLimit] called instead of the default 429 body
 */
const rateLimiterOptions = ({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  onLimit
} = {}) => ({
  windowMs,
  limit: max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientKey,
  handler: onLimit || limitedResponse,

  // `trust proxy` is not configured, so behind a load balancer every request
  // appears to come from the proxy and shares one bucket. That is the
  // pre-existing behaviour. Express-rate-limit's `xForwardedForHeader` check
  // turns that situation into a 500 for every request that carries the
  // header, so it is disabled here rather than taking the app down on
  // deployment. Configure `trust proxy` (and then re-enable the check) if
  // per-client budgets are needed behind a proxy.
  validate: { xForwardedForHeader: false }
});

export default rateLimiterOptions;
