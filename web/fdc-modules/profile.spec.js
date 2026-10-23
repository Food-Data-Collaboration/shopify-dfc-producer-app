/**
 * Tests for the WebID profile (Phase 4).
 *
 * The profile is what a hub reads first, so the assertions here are about
 * discoverability: the document must parse, name the containers it serves with
 * absolute URIs, and advertise the DFC scopes the dataserver actually
 * enforces.
 */
import profile from './profile.js';
import { ADVERTISED_SCOPES, SCOPES } from './scopes/matrix.js';
import { host } from './ldp/index.js';

const makeRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    type(value) { res.headers['Content-Type'] = value; return res; },
    set(name, value) { res.headers[name] = value; return res; },
    get(name) { return res.headers[name]; },
    send(body) { res.body = body; return res; },
    end() { return res; }
  };
  return res;
};

const req = { method: 'GET', params: {}, body: undefined, get: () => undefined };

const read = async () => {
  const res = makeRes();
  await profile(req, res);
  return { res, document: JSON.parse(res.body) };
};

describe('GET /profile', () => {
  it('responds 200 as JSON-LD', async () => {
    const { res } = await read();

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/ld+json');
  });

  it('is a PersonalProfileDocument pointing at the application node', async () => {
    const { document } = await read();
    const [profileDoc, application] = document['@graph'];

    expect(profileDoc['@type']).toBe('foaf:PersonalProfileDocument');
    // An explicit node reference, not a bare string: without `@type: @id` this
    // serialises as an RDF literal and the WebID node is unreachable.
    expect(profileDoc['foaf:primaryTopic']).toEqual({
      '@id': `${host()}/profile#me`,
      '@type': '@id'
    });
    expect(application['@id']).toBe(`${host()}/profile#me`);
    expect(application['@type']).toContain('foaf:Agent');
    expect(application['@type']).toContain('solid:Application');
  });

  it('declares the prefixes it uses, quoting the dashed DFC terminology term', async () => {
    const { document } = await read();
    // The context is [v2-dfc-context, prefix-map].
    const context = document['@context'][document['@context'].length - 1];

    expect(context.foaf).toBe('http://xmlns.com/foaf/0.1/');
    expect(context.ldp).toBe('http://www.w3.org/ns/ldp#');
    expect(context.dcterms).toBe('http://purl.org/dc/terms/');
    // The v2 DFC context is first so DFC predicates are defined.
    expect(document['@context'][0]).toMatch(/v2\.0\.0\/context/);
    // `dfc-t` has to be a quoted key to be valid object syntax.
    expect(context['dfc-t']).toContain('DFC_Terminology');
  });

  it('advertises every DFC scope the dataserver enforces', async () => {
    const { document } = await read();
    const [, application] = document['@graph'];

    expect(application['dfc-t:scopes']).toEqual(ADVERTISED_SCOPES);
    expect(application['dfc-t:scopes']).toContain(SCOPES.WriteProducts);
    expect(application['dfc-t:scopes']).toContain(SCOPES.WriteOrders);
  });

  it('lists the containers it serves with absolute URIs a hub can dereference', async () => {
    const { document } = await read();
    const [, application] = document['@graph'];
    const endpoints = application['dcterms:hasPart'];

    const byId = Object.fromEntries(endpoints.map((e) => [e['@id'], e]));

    expect(byId[`${host()}/api/dfc/Enterprises`]).toBeDefined();
    expect(byId[`${host()}/api/scopes`]).toBeDefined();

    const products = endpoints.find((e) => e['dcterms:title'] === 'SuppliedProducts');
    expect(products['@id']).toBe(
      `${host()}/api/dfc/Enterprises/{EnterpriseName}/SuppliedProducts`
    );
    expect(products['@type']).toBe('ldp:Container');

    const orders = endpoints.find((e) => e['dcterms:title'] === 'Orders');
    expect(orders['@id']).toBe(`${host()}/api/dfc/Enterprises/{EnterpriseName}/Orders`);
  });

  it('states the write scopes each writable container needs', async () => {
    const { document } = await read();
    const [, application] = document['@graph'];

    const products = application['dcterms:hasPart']
      .find((e) => e['dcterms:title'] === 'SuppliedProducts');
    const orders = application['dcterms:hasPart']
      .find((e) => e['dcterms:title'] === 'Orders');

    expect(products['dcterms:description']).toContain('WriteProducts');
    expect(orders['dcterms:description']).toContain('WriteOrders');
  });

  it('names the OIDC issuer as the authentication authority', async () => {
    const { document } = await read();
    const [, application] = document['@graph'];

    expect(Array.isArray(application['sec:authentication'])).toBe(true);
    expect(application['sec:authentication'][0]['@id']).toBeTruthy();
  });
});
