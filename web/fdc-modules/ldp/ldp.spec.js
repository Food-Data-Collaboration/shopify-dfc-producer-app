/**
 * Unit tests for the LDP foundation module (Phase 0).
 *
 * These are the pieces every DFC route depends on, so they are tested directly
 * rather than only through a controller: envelope construction, ETag /
 * precondition handling, Prefer, problem documents, and the Accept-Content
 * negotiation the hubs rely on.
 */
import {
  LDP_TYPES,
  buildContainer,
  checkPreconditions,
  containerUri,
  etagFor,
  graphToMembers,
  ldpOptions,
  parseLdpBody,
  preferReturn,
  sendLdp,
  sendProblem
} from './index.js';

const V2 = 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json';

/** Minimal express req/res doubles; `res` records what sendLdp wrote. */
const makeRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    type(value) { res.headers['Content-Type'] = value; return res; },
    set(name, value) {
      res.headers[name] = value;
      return res;
    },
    get(name) { return res.headers[name]; },
    send(body) { res.body = body; return res; },
    end() { return res; }
  };
  return res;
};

const makeReq = ({ headers = {}, body, method = 'GET', params = {} } = {}) => ({
  method,
  params,
  body,
  get: (name) => headers[name]
});

describe('containerUri', () => {
  it('joins HOST with path segments and collapses stray slashes', () => {
    // config.HOST is read from web/.env; assert the shape rather than the host.
    expect(containerUri('api/dfc/Enterprises', 'acme')).toMatch(
      /^https?:\/\/[^/]+\/api\/dfc\/Enterprises\/acme$/
    );
  });

  it('tolerates leading and trailing slashes on each segment', () => {
    expect(containerUri('/api/dfc/Enterprises/', '/acme/')).toMatch(
      /\/api\/dfc\/Enterprises\/acme$/
    );
  });
});

describe('graphToMembers', () => {
  it('splits a multi-object @graph export', () => {
    const graph = JSON.stringify({
      '@context': V2,
      '@graph': [{ '@id': 'a' }, { '@id': 'b' }]
    });

    expect(graphToMembers(graph)).toEqual({
      '@context': V2,
      members: [{ '@id': 'a' }, { '@id': 'b' }]
    });
  });

  it('wraps a single-object export as a one-member list', () => {
    const graph = JSON.stringify({ '@context': V2, '@id': 'a', '@type': 'dfc-b:Enterprise' });

    const { members } = graphToMembers(graph);

    expect(members).toHaveLength(1);
    expect(members[0]['@id']).toBe('a');
  });

  it('tolerates null and undefined graphs (empty container)', () => {
    expect(graphToMembers(null).members).toEqual([]);
    expect(graphToMembers(undefined).members).toEqual([]);
  });

  it('accepts an already-parsed object as well as a JSON string', () => {
    const parsed = { '@context': V2, '@graph': [{ '@id': 'a' }] };
    expect(graphToMembers(parsed).members).toEqual([{ '@id': 'a' }]);
  });
});

describe('buildContainer', () => {
  it('produces an ldp:Container with ldp:contains set semantics', () => {
    const members = [{ '@id': 'a' }];
    const container = buildContainer('https://host/api/dfc/Enterprises', members);

    expect(container['@id']).toBe('https://host/api/dfc/Enterprises');
    expect(container['@type']).toBe('ldp:Container');
    expect(container['ldp:contains']).toBe(members);
    // The inline context must map the ldp prefix and the @set container.
    expect(container['@context'][0]).toBe(V2);
    expect(container['@context'][1].ldp).toBe('http://www.w3.org/ns/ldp#');
    expect(container['@context'][1]['ldp:contains']['@container']).toBe('@set');
  });
});

describe('etagFor', () => {
  it('is a weak ETag over the exact payload', () => {
    const etag = etagFor({ a: 1 });
    expect(etag).toMatch(/^W\/"[\w-]+"$/);
    expect(etagFor({ a: 1 })).toBe(etag);
  });

  it('distinguishes different payloads', () => {
    expect(etagFor({ a: 1 })).not.toBe(etagFor({ a: 2 }));
  });

  it('treats a string payload as its own bytes, not re-stringified JSON', () => {
    // Connector exports are pretty-printed strings; the ETag must be stable
    // for the same bytes a client would compare against.
    expect(etagFor('{\n  "a": 1\n}')).toBe(etagFor('{\n  "a": 1\n}'));
  });
});

describe('checkPreconditions', () => {
  const etag = etagFor({ a: 1 });

  it('passes when If-Match matches (weak comparison)', () => {
    expect(checkPreconditions(makeReq({ headers: { 'If-Match': etag } }), etag)).toBeNull();
    // Weak comparison ignores the W/ prefix on the client side.
    expect(
      checkPreconditions(makeReq({ headers: { 'If-Match': etag.replace('W/', '') } }), etag)
    ).toBeNull();
  });

  it('passes If-Match: * when the resource exists', () => {
    expect(checkPreconditions(makeReq({ headers: { 'If-Match': '*' } }), etag)).toBeNull();
  });

  it('fails with 412 when If-Match does not match', () => {
    const result = checkPreconditions(makeReq({ headers: { 'If-Match': '"nope"' } }), etag);
    expect(result.status).toBe(412);
  });

  it('returns 304 for a matching If-None-Match on GET', () => {
    const req = makeReq({ headers: { 'If-None-Match': etag }, method: 'GET' });
    expect(checkPreconditions(req, etag).status).toBe(304);
  });

  it('returns 412 (not 304) for a matching If-None-Match on a write', () => {
    const req = makeReq({ headers: { 'If-None-Match': etag }, method: 'PUT' });
    expect(checkPreconditions(req, etag).status).toBe(412);
  });

  it('rejects If-Match on a resource with no known ETag', () => {
    const result = checkPreconditions(makeReq({ headers: { 'If-Match': '*' } }), null);
    expect(result.status).toBe(400);
  });

  it('ignores If-None-Match when the resource has no ETag yet', () => {
    const req = makeReq({ headers: { 'If-None-Match': '"x"' } });
    expect(checkPreconditions(req, null)).toBeNull();
  });
});

describe('preferReturn', () => {
  it('defaults to returning the representation', () => {
    expect(preferReturn(makeReq())).toBe('representation');
  });

  it('honours return=minimal', () => {
    expect(preferReturn(makeReq({ headers: { Prefer: 'return=minimal' } }))).toBe('minimal');
    expect(preferReturn(makeReq({ headers: { Prefer: 'handling=lenient, return=minimal' } })))
      .toBe('minimal');
  });

  it('lets an explicit return=representation override a minimal in the same header', () => {
    const req = makeReq({ headers: { Prefer: 'return=minimal, return=representation' } });
    expect(preferReturn(req)).toBe('representation');
  });
});

describe('parseLdpBody', () => {
  it('parses the raw string produced by the express.text parser', () => {
    expect(parseLdpBody(makeReq({ body: '{"a":1}' }))).toEqual({ a: 1 });
  });

  it('passes an already-parsed object through', () => {
    expect(parseLdpBody(makeReq({ body: { a: 1 } }))).toEqual({ a: 1 });
  });

  it('decodes a Buffer body', () => {
    expect(parseLdpBody(makeReq({ body: Buffer.from('{"a":1}') }))).toEqual({ a: 1 });
  });

  it('treats an empty body as an empty document', () => {
    expect(parseLdpBody(makeReq({ body: '' }))).toEqual({});
    expect(parseLdpBody(makeReq({ body: undefined }))).toEqual({});
  });

  it('raises a 400-carrying error on malformed JSON rather than throwing a raw SyntaxError', () => {
    try {
      parseLdpBody(makeReq({ body: '{not json' }));
      throw new Error('expected parseLdpBody to throw');
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });
});

describe('sendLdp', () => {
  it('sends JSON-LD with an ETag and a Vary on Accept', () => {
    const res = makeRes();
    sendLdp(makeReq(), res, 200, { '@id': 'a' }, { member: true });

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/ld+json');
    expect(res.headers.ETag).toMatch(/^W\/"/);
    expect(res.headers.Vary).toBe('Accept');
  });

  it('advertises Container types on a container response', () => {
    const res = makeRes();
    sendLdp(makeReq(), res, 200, { a: 1 }, { container: true });

    expect(res.headers.Link).toContain(LDP_TYPES.CONTAINER);
    expect(res.headers.Link).toContain(LDP_TYPES.BASIC_CONTAINER);
    // Containers are POST targets, so Accept-Post is advertised.
    expect(res.headers['Accept-Post']).toBe('application/ld+json');
  });

  it('advertises Resource/RDFSource on a member response', () => {
    const res = makeRes();
    sendLdp(makeReq(), res, 200, { a: 1 }, { member: true });

    expect(res.headers.Link).toContain(LDP_TYPES.RESOURCE);
    expect(res.headers.Link).toContain(LDP_TYPES.RDF_SOURCE);
    // A member must not claim to be a container, or a hub will try to POST it.
    expect(res.headers.Link).not.toContain(LDP_TYPES.CONTAINER);
    expect(res.headers.Link).not.toContain(LDP_TYPES.BASIC_CONTAINER);
    expect(res.headers['Accept-Post']).toBeUndefined();
    expect(res.headers['Accept-Patch']).toBe('application/ld+json');
  });

  it('exposes the LDP headers to browser clients', () => {
    const res = makeRes();
    sendLdp(makeReq(), res, 200, {}, { member: true, location: 'https://host/a' });

    const exposed = res.headers['Access-Control-Expose-Headers'];
    ['Link', 'ETag', 'Location', 'Accept-Post', 'Allow'].forEach((header) => {
      expect(exposed).toContain(header);
    });
    expect(res.headers.Location).toBe('https://host/a');
  });

  it('sends a string payload verbatim, so the ETag covers the sent bytes', () => {
    const res = makeRes();
    const graph = JSON.stringify({ '@context': V2, '@id': 'a' }, null, 2);

    sendLdp(makeReq(), res, 200, graph, { member: true });

    expect(res.body).toBe(graph);
    expect(res.headers.ETag).toBe(etagFor(graph));
  });
});

describe('sendProblem', () => {
  it('emits an RFC 7807 document with the right status and content type', () => {
    const res = makeRes();
    sendProblem(makeReq({ params: { EnterpriseName: 'acme' } }), res, 409, {
      title: 'Conflict',
      detail: 'already exists'
    });

    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(409);
    expect(res.headers['Content-Type']).toBe('application/ld+json');
    expect(body).toMatchObject({ title: 'Conflict', status: 409, detail: 'already exists' });
  });

  it('names the enterprise in the problem so a client can route the failure', () => {
    const res = makeRes();
    sendProblem(makeReq({ params: { EnterpriseName: 'acme' } }), res, 404, { detail: 'nope' });

    expect(JSON.parse(res.body).enterprise).toMatch(/\/api\/dfc\/Enterprises\/acme$/);
  });
});

describe('ldpOptions', () => {
  it('advertises POST on a container and the write verbs on a writable member', () => {
    const container = makeRes();
    ldpOptions({ container: true, writable: false })(makeReq({ method: 'OPTIONS' }), container);
    expect(container.headers.Allow).toBe('GET, POST, HEAD, OPTIONS');
    expect(container.headers['Accept-Post']).toBe('application/ld+json');

    const member = makeRes();
    ldpOptions({ container: false, writable: true })(makeReq({ method: 'OPTIONS' }), member);
    expect(member.headers.Allow).toBe('GET, PUT, PATCH, DELETE, HEAD, OPTIONS');
    expect(member.headers['Accept-Patch']).toBe('application/ld+json');
  });

  it('does not advertise write verbs on a read-only member', () => {
    const res = makeRes();
    ldpOptions({ container: false, writable: false })(makeReq({ method: 'OPTIONS' }), res);
    expect(res.headers.Allow).toBe('GET, HEAD, OPTIONS');
  });
});
