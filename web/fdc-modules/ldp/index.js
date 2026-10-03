/**
 * LDP (Linked Data Platform) helpers.
 *
 * Every DFC route in this app is a Linked Data Platform resource: either a
 * container (a collection of members) or a member. DjangoLDP signals that
 * with `Link`/`Accept-Post`/`Accept-Patch` headers rather than a dedicated
 * content type, so we do the same here:
 *
 *   container GET  -> Link: ...#Container, ...#BasicContainer
 *   member GET     -> Link: ...#Resource, ...#RDFSource
 *   container POST -> Accept-Post: application/ld+json
 *   member writes  -> Accept-Patch: application/ld+json
 *
 * Responses are `application/ld+json`. The body itself is always the connector
 * graph (`@context` + `@graph`, or a single member object) so existing hub
 * clients that already parse `@graph` keep working; container membership is
 * additionally advertised through `ldp:contains` when
 * `LDP_CONTAINS_ENVELOPE` is on (see below).
 */
import { createHash } from 'crypto';
import config from '../../config.js';

export const LDP_NS = 'http://www.w3.org/ns/ldp#';

export const LDP_TYPES = {
  RESOURCE: `${LDP_NS}Resource`,
  RDF_SOURCE: `${LDP_NS}RDFSource`,
  CONTAINER: `${LDP_NS}Container`,
  BASIC_CONTAINER: `${LDP_NS}BasicContainer`,
  // LDP 1.0 calls these membership statements; the "ContainerMember" name is
  // not an LDP term, so don't invent one.
  MEMBERSHIP_RESOURCE: `${LDP_NS}ContainerMembershipResource`,
  CONTAINS: `${LDP_NS}contains`
};

export const LDP_CONTENT_TYPES = 'application/ld+json';

/**
 * Headers a browser client needs `Access-Control-Expose-Headers` for. Mirrors
 * DjangoLDP's LDP_EXPOSE_HEADERS so hub tooling written against the central
 * directory keeps working.
 */
const EXPOSED_HEADERS = [
  'Link',
  'ETag',
  'Last-Modified',
  'Accept-Post',
  'Accept-Patch',
  'Preference-Applied',
  'Location',
  'Allow',
  'Vary'
];

/**
 * Normalise one path segment: drop empty components so `a//b` becomes `a/b`
 * and a leading/trailing slash is tolerated, and drop `.`/`..` so a hostile
 * route param cannot walk out of the container path it was given.
 *
 * Written with split/filter rather than `/^\/+|\/+$/g`: that regex is not
 * actually exponential, but it is a slash-anchored alternation run against
 * request-derived values, which is the shape CodeQL flags as polynomial.
 * Splitting is linear by construction.
 *
 * Only ever applied to *path segments*, never to `config.HOST` — collapsing
 * `http://host` here would turn its scheme separator into `http:/host`.
 */
const trimSegment = (segment) =>
  String(segment)
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');

/**
 * `config.HOST` without a trailing slash. `config.HOST` is expected to end in
 * a slash (see the gotcha in AGENTS.md), and only the trailing one is
 * stripped — the scheme's `//` has to survive.
 */
export const host = () => config.HOST.replace(/\/+$/, '');

/**
 * Absolute URI of an LDP container or member, e.g. the SuppliedProducts
 * collection.
 *
 * Segments come from route params, so this is the single choke point that
 * keeps a hostile `:EnterpriseName` from smuggling an extra path or host into
 * a URI we publish.
 */
export const containerUri = (...segments) =>
  [host(), ...segments.map(trimSegment).filter(Boolean)].join('/');

/**
 * Parse a connector `export()` result (a pretty-printed JSON string, or an
 * already-parsed object) into `{ '@context', members }`. Single-member exports
 * come back as a bare object rather than a `@graph`; normalise both to an
 * array of member descriptions so envelopes can be built uniformly.
 */
export const graphToMembers = (graph) => {
  if (graph === null || graph === undefined) {
    return { '@context': undefined, members: [] };
  }

  const parsed = typeof graph === 'string' ? JSON.parse(graph) : graph;

  if (Array.isArray(parsed)) {
    return { '@context': undefined, members: parsed };
  }

  const { '@context': context, '@graph': members, ...rest } = parsed;

  if (!members) {
    return { '@context': context, members: [rest] };
  }

  return {
    '@context': context,
    members: Array.isArray(members) ? members : [members]
  };
};

/**
 * Build an `ldp:Container` document. `members` are full member descriptions
 * (the same shape a `GET` on the member returns), which is what DjangoLDP
 * emits for its collection endpoints.
 */
export const buildContainer = (id, members) => ({
  '@context': [
    'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json',
    { ldp: LDP_NS, 'ldp:contains': { '@container': '@set' } }
  ],
  '@id': id,
  '@type': 'ldp:Container',
  'ldp:contains': members
});

/**
 * Weak ETag over the exact bytes we are about to send, so a client replaying
 * `If-Match` always compares like with like.
 *
 * SHA-256 rather than SHA-1: an ETag is only a cache validator, so either is
 * functionally fine, but SHA-1 is on every "do not use" list and CodeQL flags
 * it. Nothing here is a security boundary — a client cannot forge one to gain
 * access, it only controls whether its own conditional request is answered
 * 304 — but there is no reason to ship a deprecated digest.
 */
export const etagFor = (payload) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return `W/"${createHash('sha256').update(body).digest('base64url')}"`;
};

/**
 * RFC 7232 strong comparison for `If-Match`: the two validators must be
 * byte-identical, *including* the weakness marker. A weak `If-Match` therefore
 * never matches a strong validator (and vice versa), which is what stops a
 * client claiming a resource matches when we only know its bytes are
 * semantically equivalent. `If-None-Match` uses weak comparison instead, which
 * is what RFC 7232 mandates for it.
 */
const strongCompare = (a, b) => String(a).trim() === String(b).trim();

/** Strong comparison over a list of validators, for `If-Match`. */
const strongMatch = (header, currentEtag) =>
  header.split(',').map((part) => part.trim()).filter(Boolean)
    .some((tag) => strongCompare(tag, currentEtag));

const weakNormalise = (value) => {
  const trimmed = String(value).trim();
  const unprefixed = trimmed.startsWith('W/') ? trimmed.slice(2) : trimmed;
  return unprefixed.length >= 2
    && unprefixed.startsWith('"')
    && unprefixed.endsWith('"')
    ? unprefixed.slice(1, -1)
    : unprefixed;
};

const parseEtagList = (header) =>
  header.split(',').map((part) => weakNormalise(part)).filter(Boolean);

/** Weak comparison, for `If-None-Match` and `If-Match: *`. */
const matches = (header, currentEtag) => {
  const tags = parseEtagList(header);
  if (tags.includes('*')) {
    return true;
  }
  return tags.includes(weakNormalise(currentEtag));
};

/**
 * `If-Match` / `If-None-Match` preconditions (DjangoLDP does the same, and
 * rejects malformed headers with 400 rather than silently passing).
 *
 * @returns {null | { status: number, title: string, detail: string }} a problem
 *   to send, or null when the request may proceed.
 */
export const checkPreconditions = (req, currentEtag) => {
  const { method } = req;
  const ifMatch = req.get('If-Match');
  const ifNoneMatch = req.get('If-None-Match');

  if (ifMatch) {
    if (!currentEtag) {
      return {
        status: 400,
        title: 'Malformed request',
        detail: 'If-Match supplied for a resource without a known ETag'
      };
    }
    try {
      // `*` still means "the resource exists", but a concrete validator must
      // match strongly per RFC 7232 3.1.
      const satisfied = ifMatch.trim() === '*'
        ? true
        : strongMatch(ifMatch, currentEtag);

      if (!satisfied) {
        return {
          status: 412,
          title: 'Precondition failed',
          detail: 'If-Match does not match the current ETag of the resource'
        };
      }
    } catch (err) {
      return { status: 400, title: 'Malformed request', detail: `Malformed If-Match header: ${err.message}` };
    }
  }

  if (ifNoneMatch && currentEtag) {
    try {
      if (matches(ifNoneMatch, currentEtag)) {
        if (method === 'GET' || method === 'HEAD') {
          return {
            status: 304,
            title: 'Not modified',
            detail: 'The resource matches the supplied If-None-Match ETag'
          };
        }
        return {
          status: 412,
          title: 'Precondition failed',
          detail: 'If-None-Match matched: the resource already exists at this ETag'
        };
      }
    } catch (err) {
      return { status: 400, title: 'Malformed request', detail: `Malformed If-None-Match header: ${err.message}` };
    }
  }

  return null;
};

/** RFC 7240 `Prefer: return=minimal` / `return=representation`. */
export const preferReturn = (req) => {
  const prefer = req.get('Prefer') || '';
  if (/return\s*=\s*minimal/i.test(prefer) && !/return\s*=\s*representation/i.test(prefer)) {
    return 'minimal';
  }
  return 'representation';
};

/**
 * Return `location` only if it is a same-origin absolute URI built from
 * `config.HOST`, otherwise null (and the header is then omitted).
 *
 * A `Location` header on a 201 is a redirect for any client that follows it,
 * so a caller able to influence one could otherwise bounce a hub to an
 * attacker-controlled host. Controllers build these URIs from route params,
 * so the guard belongs here rather than at each call site.
 */
const safeLocation = (location) => {
  const value = String(location);

  // A scheme-relative "//evil.example" or a backslash variant is the classic
  // bypass, and a relative path is never what our controllers produce.
  if (!value.startsWith(`${host()}/`)) {
    return null;
  }
  if (value.includes('\\') || value.includes('\n') || value.includes('\r')) {
    return null;
  }

  return value;
};

/**
 * Send a JSON-LD body and decorate it with the LDP protocol headers.
 *
 * @param {object} options
 * @param {boolean} options.container  advertise `ldp:Container` (GET on a collection)
 * @param {boolean} options.member     advertise `ldp:Resource`/`ldp:RDFSource`
 * @param {string}  options.location   `Location` header (POST/PUT results)
 * @param {string[]} options.link      extra `Link` values (pagination, service docs)
 * @param {string}  options.allow      explicit `Allow`, otherwise derived
 */
export const sendLdp = (req, res, status, body, options = {}) => {
  const {
    container = false,
    member = false,
    writable = false,
    location,
    link = [],
    allow,
    lastModified,
    preferenceApplied
  } = options;

  const payload = typeof body === 'string' ? body : JSON.stringify(body, null, 2);

  const linkHeaders = [];
  if (container) {
    linkHeaders.push(
      `<${LDP_TYPES.RESOURCE}>; rel="type"`,
      `<${LDP_TYPES.RDF_SOURCE}>; rel="type"`,
      `<${LDP_TYPES.CONTAINER}>; rel="type"`,
      `<${LDP_TYPES.BASIC_CONTAINER}>; rel="type"`
    );
  } else if (member) {
    linkHeaders.push(
      `<${LDP_TYPES.RESOURCE}>; rel="type"`,
      `<${LDP_TYPES.RDF_SOURCE}>; rel="type"`
    );
  }

  res.status(status);
  // `res.send(string)` falls back to text/html in Express if no type is set,
  // which would let a problem `detail` (built from request-derived text) be
  // rendered as HTML. Pin the type first and add nosniff so a browser cannot
  // be talked into sniffing the body as markup.
  res.type(LDP_CONTENT_TYPES);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Vary', 'Accept');
  res.set('ETag', etagFor(payload));
  res.set('Link', [...linkHeaders, ...link].join(', '));
  res.set('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));

  if (location) {
    // The Location value reaches us from controllers, which build it from
    // route params. Only ever emit a same-origin absolute URI: an open
    // redirect here would turn a legitimate 201 into a phishing primitive.
    const resolved = safeLocation(location);
    if (resolved) {
      res.set('Location', resolved);
    }
  }
  if (lastModified) {
    res.set('Last-Modified', new Date(lastModified).toUTCString());
  }
  if (preferenceApplied) {
    res.set('Preference-Applied', preferenceApplied);
  }
  if (allow) {
    res.set('Allow', allow);
  }
  // Only advertise a write media type on a route that actually accepts the
  // write. Advertising `Accept-Post` on a read-only container invites a client
  // to publish there and collect a 405 it had no way to anticipate.
  if (container && writable) {
    res.set('Accept-Post', LDP_CONTENT_TYPES);
  }
  if (member && writable) {
    res.set('Accept-Patch', LDP_CONTENT_TYPES);
  }

  return res.send(payload);
};

/** Send a connector graph (already an LDP member / collection document). */
export const sendGraph = (req, res, graph, options = {}) =>
  sendLdp(req, res, options.status || 200, graph, options);

/** `Prefer: return=minimal` collapses a successful write to `204 + Location`. */
export const sendWriteResult = (req, res, options = {}) => {
  const {
    status = 200, body, location, ...rest
  } = options;

  if (preferReturn(req) === 'minimal') {
    return sendLdp(req, res, 204, '', {
      ...rest,
      location,
      preferenceApplied: 'return=minimal'
    });
  }
  return sendLdp(req, res, status, body, { ...rest, location });
};

/**
 * RFC 7807 problem document. DFC hubs expect JSON-LD on success and treat
 * anything else as an opaque failure, but a machine-readable problem shape
 * (rather than a bare `.end()`) is what makes 401/403/412 debuggable.
 */
export const sendProblem = (req, res, status, {
  title, detail, type, allow
} = {}) => {
  const problem = {
    type: type || 'about:blank',
    title: title || res.phrase || 'Error',
    status,
    detail
  };

  if (req?.params?.EnterpriseName) {
    problem.enterprise = containerUri('api/dfc/Enterprises', req.params.EnterpriseName);
  }

  // A 405 or 501 is only actionable if it says what *is* allowed.
  if (allow) {
    res.set('Allow', allow);
  }

  return sendLdp(req, res, status, problem);
};

/**
 * Route bodies arrive as a string on the Orders/Enterprises routes (they use
 * the wildcard-json `express.text` parser) and as a parsed object on
 * SuppliedProducts (`express.json`). Accept both, plus `application/ld+json`.
 */
export const parseLdpBody = (req) => {
  const { body } = req;

  if (body === undefined || body === null || body === '') {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (err) {
      const error = new Error(`Request body is not valid JSON: ${err.message}`);
      error.status = 400;
      error.title = 'Malformed request';
      throw error;
    }
  }

  if (Buffer.isBuffer(body)) {
    return parseLdpBody({ ...req, body: body.toString('utf8') });
  }

  if (typeof body === 'object') {
    return body;
  }

  const error = new Error('Request body must be a JSON-LD document');
  error.status = 400;
  error.title = 'Malformed request';
  throw error;
};

/** The verbs an LDP container or member accepts, for the `Allow` header. */
const allowedMethods = ({ container, writable }) => {
  if (container) {
    // Only advertise POST on a container that actually accepts one. Telling a
    // client it may publish to a read-only container sends it into a 405 it
    // had no way to anticipate.
    return writable
      ? ['GET', 'POST', 'HEAD', 'OPTIONS']
      : ['GET', 'HEAD', 'OPTIONS'];
  }
  if (writable) {
    return ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  }
  return ['GET', 'HEAD', 'OPTIONS'];
};

/**
 * `OPTIONS` handler. DjangoLDP answers the preflight itself rather than
 * letting DRF fall through to schema advertisement, so hub clients get
 * `Allow` / `Accept-Post` / `Accept-Patch` without a body.
 */
export const ldpOptions = ({ container, writable }) => {
  // Order matches DjangoLDP: read/create on a container, the write verbs then
  // HEAD/OPTIONS on a member.
  const allow = allowedMethods({ container, writable });

  return (req, res) => {
    res.set('Allow', allow.join(', '));
    // Only advertise the write media type the route actually accepts.
    if (writable) {
      if (container) {
        res.set('Accept-Post', LDP_CONTENT_TYPES);
      } else {
        res.set('Accept-Patch', LDP_CONTENT_TYPES);
      }
    }
    res.set(
      'Link',
      [
        `<${LDP_TYPES.RESOURCE}>; rel="type"`,
        `<${LDP_TYPES.RDF_SOURCE}>; rel="type"`,
        ...(container
          ? [`<${LDP_TYPES.CONTAINER}>; rel="type"`, `<${LDP_TYPES.BASIC_CONTAINER}>; rel="type"`]
          : [])
      ].join(', ')
    );
    res.set('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));
    res.set('Vary', 'Accept');
    return res.status(200).end();
  };
};

/**
 * Strip control characters from a value before it goes into a log line.
 * `req.originalUrl` is attacker-controlled and a newline in it would forge
 * whole log entries (and can corrupt a terminal reading the logs).
 */
// eslint-disable-next-line no-control-regex
const logSafe = (value) => String(value).replace(/[\u0000-\u001f\u007f]/g, '');

/**
 * Wrap an express handler so anything it throws becomes a problem document
 * instead of a bare 500, and so a 404/405 raised with `res.sendProblem`-style
 * metadata keeps its status.
 */
export const withLdpErrors = (handler) => async (req, res, next) => {
  try {
    return await handler(req, res, next);
  } catch (error) {
    if (res.headersSent) {
      return next(error);
    }
    const status = error.status || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error(
        `LDP ${logSafe(req.method)} ${logSafe(req.originalUrl || req.url)} failed`,
        error
      );
    }
    return sendProblem(req, res, status, {
      title: error.title || (status === 500 ? 'Internal server error' : 'Request failed'),
      detail: status === 500 ? 'The resource could not be processed' : error.message
    });
  }
};

export { EXPOSED_HEADERS };
