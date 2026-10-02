/**
 * A small fixed-window rate limiter for the public DFC API.
 *
 * Why this exists: `checkUserAccessPermissions` introspects an OIDC token on
 * every request (a network round trip to the identity provider) before it
 * decides anything. Without a limit, an unauthenticated caller can drive that
 * into a request-amplification loop against both us and the IdP — which is
 * what CodeQL flags as "route performs authorization but is not rate-limited".
 *
 * Deliberately dependency-free and in-memory:
 *   - no new package in the lockfile for ~40 lines of arithmetic;
 *   - per-process state, which is correct for a single-instance deployment
 *     and no worse than nothing when scaled horizontally (each instance
 *     enforces its own budget).
 *
 * If this ever runs behind multiple replicas behind a load balancer, swap the
 * store for Redis; the middleware signature will not need to change.
 */

/** Window length. Long enough not to break a hub crawling a container. */
const DEFAULT_WINDOW_MS = 60_000;

/** Requests allowed per window per client identity. */
const DEFAULT_MAX = 120;

/**
 * Identify the caller. Preference order:
 *   1. the OIDC client_id, when the token has already been introspected —
 *      this is the real consumer, and grouping by it is what makes the limit
 *      fair between the hubs behind one NAT;
 *   2. the OAuth2 token's `sub` claim, read without verification purely as a
 *      bucket key (never for authorization) so a single user cannot exhaust
 *      the whole budget;
 *   3. the remote address.
 */
/**
 * Read the `sub` claim without verifying the signature. This is only ever used
 * to spread load across buckets, never to grant or deny access, so an
 * attacker forging a token gains nothing but their own bucket.
 */
const unverifiedSubject = (jwt) => {
  try {
    const [, payload] = jwt.split('.');
    if (!payload) {
      return null;
    }
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalised.length % 4)) % 4;
    const padded = normalised.padEnd(normalised.length + padding, '=');
    const { sub } = JSON.parse(Buffer.from(padded, 'base64').toString());
    return typeof sub === 'string' ? sub.slice(0, 64) : null;
  } catch {
    // Opaque (non-JWT) tokens have no readable subject; fall through to the IP.
    return null;
  }
};

const clientKey = (req) => {
  if (req.tokenSet?.client_id) {
    return `client:${req.tokenSet.client_id}`;
  }

  const header = req.get('authorization');
  if (header?.startsWith('Bearer ') || header?.startsWith('JWT ')) {
    const sub = unverifiedSubject(header.split(' ')[1]);
    if (sub) {
      return `sub:${sub}`;
    }
  }

  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
};

/**
 * Sliding-window counter keyed by client. Old entries are pruned lazily on
 * write rather than by a timer, so there is nothing to keep alive and nothing
 * to leak if the process is restarted.
 */
const buckets = new Map();

const allow = (key, now, windowMs, max) => {
  const recent = (buckets.get(key) || []).filter((at) => now - at < windowMs);

  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }

  recent.push(now);
  buckets.set(key, recent);
  return true;
};

/** Drop buckets nobody has touched in a while, so the map cannot grow forever. */
const prune = (now) => {
  if (buckets.size < 1000) {
    return;
  }
  [...buckets.entries()]
    .filter(([, hits]) => !hits.some((at) => now - at < DEFAULT_WINDOW_MS))
    .forEach(([key]) => buckets.delete(key));
};

/**
 * @param {object} [options]
 * @param {number} [options.windowMs] window length in ms
 * @param {number} [options.max] requests allowed per window per client
 * @param {Function} [options.onLimit] called instead of the default 429 body
 */
const rateLimit = ({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  onLimit
} = {}) => {
  const limiter = (req, res, next) => {
    const now = Date.now();
    prune(now);

    if (allow(clientKey(req), now, windowMs, max)) {
      return next();
    }

    const retryAfter = Math.ceil(windowMs / 1000);
    res.set('Retry-After', String(retryAfter));
    res.set('Vary', 'Accept, Authorization');

    if (onLimit) {
      return onLimit(req, res);
    }

    return res.status(429).json({
      type: 'about:blank',
      title: 'Too many requests',
      status: 429,
      detail: `Rate limit exceeded. Retry after ${retryAfter}s.`
    });
  };

  limiter.reset = () => buckets.clear();
  return limiter;
};

export default rateLimit;
