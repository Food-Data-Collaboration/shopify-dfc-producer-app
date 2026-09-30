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

export const host = () => config.HOST.replace(/\/+$/, '');

/**
 * Absolute URI of an LDP container or member, e.g. the SuppliedProducts
 * collection. `config.HOST` is expected to end in a slash (see the gotcha in
 * AGENTS.md); we trim it here so callers never have to care.
 */
export const containerUri = (...segments) =>
  [host(), ...segments.map((s) => String(s).replace(/^\/+|\/+$/g, ''))].join('/');

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
 */
export const etagFor = (payload) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return `W/"${createHash('sha1').update(body).digest('base64url')}"`;
};

/** RFC 7232 weak comparison: strip W/ and the quotes, compare the values. */
const normaliseEtag = (value) => String(value).trim().replace(/^W\//, '').replace(/^"|"$/g, '');

const parseEtagList = (header) =>
  header.split(',').map((part) => normaliseEtag(part)).filter(Boolean);

const matches = (header, currentEtag) => {
  const tags = parseEtagList(header);
  if (tags.includes('*')) {
    return true;
  }
  return tags.includes(normaliseEtag(currentEtag));
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
      if (!matches(ifMatch, currentEtag)) {
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
  res.type(LDP_CONTENT_TYPES);
  res.set('Vary', 'Accept');
  res.set('ETag', etagFor(payload));
  res.set('Link', [...linkHeaders, ...link].join(', '));
  res.set('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));

  if (location) {
    res.set('Location', location);
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
  // Containers accept POST; members accept PATCH. Advertise both everywhere we
  // might accept a write, matching DjangoLDP's blanket behaviour.
  if (container) {
    res.set('Accept-Post', LDP_CONTENT_TYPES);
  }
  res.set('Accept-Patch', LDP_CONTENT_TYPES);

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
export const sendProblem = (req, res, status, { title, detail, type } = {}) => {
  const problem = {
    type: type || 'about:blank',
    title: title || res.phrase || 'Error',
    status,
    detail
  };

  if (req?.params?.EnterpriseName) {
    problem.enterprise = containerUri('api/dfc/Enterprises', req.params.EnterpriseName);
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
    return ['GET', 'POST', 'HEAD', 'OPTIONS'];
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
    if (container) {
      res.set('Accept-Post', LDP_CONTENT_TYPES);
    } else {
      res.set('Accept-Patch', LDP_CONTENT_TYPES);
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
      console.error(`LDP ${req.method} ${req.originalUrl || req.url} failed`, error);
    }
    return sendProblem(req, res, status, {
      title: error.title || (status === 500 ? 'Internal server error' : 'Request failed'),
      detail: status === 500 ? 'The resource could not be processed' : error.message
    });
  }
};

export { EXPOSED_HEADERS };
