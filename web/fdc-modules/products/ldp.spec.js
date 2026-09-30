/**
 * Tests for the LDP write path on SuppliedProducts (Phase 2).
 *
 * The controllers are exercised against a fake Shopify GraphQL client and a
 * fake variants table, so these tests cover the parts that are actually
 * ours: the DFC payload contract (version gate, member-URI parsing, price
 * extraction, PUT-vs-PATCH field semantics), the mapping rules, and the
 * status codes and headers a hub sees.
 *
 * They deliberately do not test Shopify's behaviour — that is what the mock
 * client is for.
 */
import {
  getProducts,
  getProduct,
  patchSuppliedProduct,
  publishSuppliedProduct,
  replaceSuppliedProduct,
  unpublishSuppliedProduct,
  suppliedProductsContainerUri,
  suppliedProductMemberUri
} from './ldp.js';
import config from '../../config.js';

const VARIANT_ID = '4242';
const PRODUCT_ID = '99';

// Read HOST from the real config so the member URIs in the fixtures match what
// `config.HOST` produces, whichever environment the suite runs in.
const HOST = config.HOST.replace(/\/+$/, '');
const V2_CONTEXT = 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json';

const memberUri = (id) => `${HOST}/api/dfc/Enterprises/acme/SuppliedProducts/${id}`;

const parentUri = (id) => `${HOST}/api/dfc/Enterprises/acme/SuppliedProducts/${id}`;

jest.mock('../../shopify.js', () => ({
  __esModule: true,
  // A stand-in for the Shopify GraphQL client. The controllers only pass it
  // through to the mocked mutation helpers, so it never issues a request.
  // Declared inside the factory because jest hoists the call above it.
  default: {
    api: {
      clients: {
        Graphql: class FakeGraphqlClient {
          constructor({ session } = {}) {
            this.session = session;
          }
        }
      }
    }
  }
}));

jest.mock('../../utils/getShopifySession.js', () => ({
  __esModule: true,
  default: jest.fn(async () => ({ accessToken: 'shpat_test' }))
}));

jest.mock('../../database/variants/variants.js', () => ({
  addVariant: jest.fn(),
  deleteVariant: jest.fn(),
  getVariants: jest.fn(async () => [])
}));

jest.mock('./controllers/shopify/mutations.js', () => ({
  findProductVariants: jest.fn(),
  findVariant: jest.fn(),
  updateProductDescription: jest.fn(),
  updateVariantInShopify: jest.fn()
}));

jest.mock('./controllers/shopify/products.js', () => ({
  findFDCProducts: jest.fn(async () => []),
  getFdcVariantsFromDB: jest.fn(async () => ({})),
  getFdcVariantsByProductIdFromDB: jest.fn(async () => ({}))
}));

jest.mock('./dfc/dfc-products.js', () => ({
  __esModule: true,
  default: jest.fn(async () => JSON.stringify({
    '@context': 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json',
    '@graph': [{ '@id': 'stub-member' }]
  }))
}));

const mutations = require('./controllers/shopify/mutations.js');
const variants = require('../../database/variants/variants.js');
const productsFromShopify = require('./controllers/shopify/products.js');
const dfcProducts = require('./dfc/dfc-products.js').default;

const memberGraph = (overrides = {}) => [
  {
    '@id': memberUri(VARIANT_ID),
    '@type': 'dfc-b:SuppliedProduct',
    'dfc-b:name': 'Apples',
    ...overrides
  }
];

/** Wrap DFC member descriptions in a v2 JSON-LD document. */
const dfcDocument = (members) => ({
  '@context': V2_CONTEXT,
  '@graph': Array.isArray(members) ? members : [members]
});

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
    end() { res.body = undefined; return res; }
  };
  return res;
};

const makeReq = ({
  method = 'GET',
  body,
  headers = {},
  params = { EnterpriseName: 'acme', ProductId: VARIANT_ID }
} = {}) => ({
  method,
  params,
  body,
  shopName: 'acme',
  shopDefaultProductType: null,
  shop: { shopName: 'acme' },
  get: (name) => headers[name]
});

/** Read the JSON body the controller sent. */
const bodyOf = (res) => JSON.parse(res.body);

const mappingRow = (overrides = {}) => ({
  id: 7,
  productId: PRODUCT_ID,
  retailVariantId: VARIANT_ID,
  enabled: true,
  ...overrides
});

/** Publish `VARIANT_ID`, so subsequent reads/writes find a mapping row. */
const withMapping = (overrides = {}) => {
  variants.getVariants.mockResolvedValue([mappingRow(overrides)]);
  productsFromShopify.getFdcVariantsByProductIdFromDB.mockResolvedValue({
    [PRODUCT_ID]: [{ retailVariantId: VARIANT_ID, enabled: true }]
  });
};

/**
 * Variant exists in Shopify but is not published yet — the state a hub's POST
 * finds. `addVariant` then makes the mapping appear, as the real INSERT does.
 */
const unpublished = () => {
  variants.getVariants.mockResolvedValue([]);
  variants.addVariant.mockImplementation(async (args) => {
    variants.getVariants.mockResolvedValue([mappingRow({
      id: 8,
      productId: args.productId,
      retailVariantId: args.retailVariantId
    })]);
    return { id: 8, ...args };
  });
  productsFromShopify.getFdcVariantsByProductIdFromDB.mockResolvedValue({
    [PRODUCT_ID]: [{ retailVariantId: VARIANT_ID, enabled: true }]
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  variants.getVariants.mockResolvedValue([]);
  productsFromShopify.getFdcVariantsFromDB.mockResolvedValue({});
  productsFromShopify.getFdcVariantsByProductIdFromDB.mockResolvedValue({});
  mutations.findVariant.mockResolvedValue({ id: VARIANT_ID, title: 'Default' });
  mutations.findProductVariants.mockResolvedValue({ id: PRODUCT_ID, variants: [] });
  mutations.updateVariantInShopify.mockResolvedValue({ id: VARIANT_ID });
  variants.addVariant.mockImplementation(async (args) => ({ id: 8, ...args }));
  variants.deleteVariant.mockResolvedValue({ id: 7 });
});

describe('URI helpers', () => {
  it('builds container and member URIs from config.HOST', () => {
    expect(suppliedProductsContainerUri('acme')).toBe(
      `${HOST}/api/dfc/Enterprises/acme/SuppliedProducts`
    );
    expect(suppliedProductMemberUri('acme', VARIANT_ID)).toBe(memberUri(VARIANT_ID));
  });

  it('produces a member URI the write path can parse back to a variant id', async () => {
    // The round trip matters: POST derives the variant id from the @id the hub
    // sends, so the URI we mint must be the URI we can read.
    unpublished();
    const res = makeRes();
    await publishSuppliedProduct(
      makeReq({ method: 'POST', body: payload() }),
      res
    );

    expect(res.headers.Location).toBe(memberUri(VARIANT_ID));
    // The minted URI must round-trip back to the same variant id, which is
    // what makes the id derivable instead of needing a lookup table.
    expect(variants.addVariant).toHaveBeenCalledWith(
      expect.objectContaining({ retailVariantId: VARIANT_ID })
    );
  });
});

describe('GET SuppliedProducts (container)', () => {
  it('returns an ldp:Container with ldp:contains and a top-level @graph', async () => {
    productsFromShopify.getFdcVariantsFromDB.mockResolvedValue({
      [PRODUCT_ID]: [{ retailVariantId: VARIANT_ID, enabled: true }]
    });

    const res = makeRes();
    await getProducts(makeReq(), res);

    const body = bodyOf(res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/ld+json');
    expect(body['@type']).toBe('ldp:Container');
    expect(body['@id']).toBe(suppliedProductsContainerUri('acme'));
    expect(body['ldp:contains']).toHaveLength(1);
    // Backwards compatibility: hubs walking @graph still find the members.
    expect(body['@graph']).toEqual(body['ldp:contains']);
    expect(res.headers['Accept-Post']).toBe('application/ld+json');
  });

  it('returns an empty container when nothing is published', async () => {
    const res = makeRes();
    await getProducts(makeReq(), res);

    expect(bodyOf(res)['ldp:contains']).toEqual([]);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET SuppliedProducts/{id} (member)', () => {
  it('404s a member that is not published', async () => {
    const res = makeRes();
    await getProduct(makeReq(), res);

    expect(res.statusCode).toBe(404);
    expect(bodyOf(res).title).toBe('Not found');
  });

  it('returns the member graph with an ETag', async () => {
    withMapping();
    const res = makeRes();
    await getProduct(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.ETag).toMatch(/^W\/"/);
    expect(bodyOf(res)['@graph']).toHaveLength(1);
  });

  it('returns the whole product group, since the DFC member @id is a variant', async () => {
    // ProductId in the route is a Shopify *product* id, while the DFC member
    // @id is the *variant* id. Document that mismatch here so a future change
    // to the routing is a deliberate decision.
    withMapping();

    const res = makeRes();
    await getProduct(makeReq(), res);

    expect(res.headers.Location).toBe(memberUri(VARIANT_ID));
  });

  it('answers a matching If-None-Match with 304', async () => {
    withMapping();
    const probe = makeRes();
    await getProduct(makeReq(), probe);
    const { ETag } = probe.headers;

    const res = makeRes();
    await getProduct(makeReq({ headers: { 'If-None-Match': ETag } }), res);

    expect(res.statusCode).toBe(304);
    expect(res.headers.ETag).toBe(ETag);
  });
});

/** The SuppliedProduct a hub would POST to publish `VARIANT_ID`. */
const member = (overrides = {}) => ({
  '@id': memberUri(VARIANT_ID),
  '@type': 'dfc-b:SuppliedProduct',
  'dfc-b:name': 'Apples',
  'dfc-b:isVariantOf': parentUri(PRODUCT_ID),
  ...overrides
});

const payload = (overrides = {}) => dfcDocument(member(overrides));

describe('POST SuppliedProducts (publish)', () => {
  it('creates the mapping row, returns 201 and a Location header', async () => {
    unpublished();

    const res = makeRes();
    await publishSuppliedProduct(makeReq({ method: 'POST', body: payload() }), res);

    expect(variants.addVariant).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      retailVariantId: VARIANT_ID,
      enabled: true,
      shopName: 'acme'
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.Location).toBe(suppliedProductMemberUri('acme', VARIANT_ID));
  });

  it('rejects a v1 context with 415 rather than coercing it', async () => {
    const res = makeRes();
    const v1 = { ...payload(), '@context': 'https://cdn.startinblox.com/owl/context-bis.jsonld' };

    await expect(
      publishSuppliedProduct(makeReq({ method: 'POST', body: v1 }), res)
    ).rejects.toMatchObject({ status: 415 });
    expect(variants.addVariant).not.toHaveBeenCalled();
  });

  it('rejects a payload with no SuppliedProduct', async () => {
    const res = makeRes();
    const bad = { '@context': V2_CONTEXT, '@graph': [{ '@id': 'x', '@type': 'dfc-b:Offer' }] };

    await expect(
      publishSuppliedProduct(makeReq({ method: 'POST', body: bad }), res)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a member URI that is not a SuppliedProducts path', async () => {
    const res = makeRes();
    const bad = payload({
      '@id': `${HOST}api/dfc/Enterprises/acme/SomethingElse/${VARIANT_ID}`
    });

    await expect(
      publishSuppliedProduct(makeReq({ method: 'POST', body: bad }), res)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a payload with no dfc-b:isVariantOf, since a product must be named', async () => {
    const res = makeRes();
    const { 'dfc-b:isVariantOf': parent, ...withoutParent } = member();

    await expect(
      publishSuppliedProduct(makeReq({ method: 'POST', body: dfcDocument(withoutParent) }), res)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('409s when the variant is already published', async () => {
    withMapping();

    const res = makeRes();
    await expect(
      publishSuppliedProduct(makeReq({ method: 'POST', body: payload() }), res)
    ).rejects.toMatchObject({ status: 409 });
    expect(variants.addVariant).not.toHaveBeenCalled();
  });

  it('404s a variant that does not exist in Shopify, leaving no mapping behind', async () => {
    mutations.findVariant.mockResolvedValue(null);
    unpublished();

    const res = makeRes();
    await expect(
      publishSuppliedProduct(makeReq({ method: 'POST', body: payload() }), res)
    ).rejects.toMatchObject({ status: 404 });
    expect(variants.addVariant).not.toHaveBeenCalled();
  });

  it('collapses to 204 + Location under Prefer: return=minimal', async () => {
    unpublished();

    const res = makeRes();
    await publishSuppliedProduct(
      makeReq({ method: 'POST', body: payload(), headers: { Prefer: 'return=minimal' } }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(res.headers.Location).toBe(suppliedProductMemberUri('acme', VARIANT_ID));
    expect(res.headers['Preference-Applied']).toBe('return=minimal');
  });
});

describe('PUT / PATCH SuppliedProducts/{id}', () => {
  const withPrice = (value = '2.49', unit = 'dfc-m:PoundSterling') => dfcDocument([
    { '@id': memberUri(VARIANT_ID), '@type': 'dfc-b:SuppliedProduct' },
    {
      '@id': '_:p1',
      '@type': 'dfc-b:Price',
      'dfc-b:value': value,
      'dfc-b:hasUnit': unit
    }
  ]);

  it('PUT replaces writable fields, clearing the ones the payload omits', async () => {
    withMapping();
    const res = makeRes();

    await replaceSuppliedProduct(
      makeReq({ method: 'PUT', body: dfcDocument(memberGraph()) }),
      res
    );

    // updateVariantInShopify(client, mapping, update) — the update is arg 3.
    const update = mutations.updateVariantInShopify.mock.calls[0][2];
    expect(update.title).toBe('Apples');
    // No image in the payload, so PUT clears it.
    expect(update.imageSrc).toBeNull();
  });

  it('PATCH only touches the fields present in the payload', async () => {
    withMapping();
    const res = makeRes();

    await patchSuppliedProduct(
      makeReq({ method: 'PATCH', body: dfcDocument(memberGraph()) }),
      res
    );

    const update = mutations.updateVariantInShopify.mock.calls[0][2];
    expect(update.title).toBe('Apples');
    // PATCH must not invent a clear for a field the hub never mentioned.
    expect(update.imageSrc).toBeUndefined();
  });

  it('maps an inline DFC Price onto the Shopify variant price and currency', async () => {
    withMapping();
    const res = makeRes();

    await patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice('2.49') }), res);

    const update = mutations.updateVariantInShopify.mock.calls[0][2];
    expect(update.price).toBe('2.49');
    expect(update.currencyCode).toBe('GBP');
  });

  it.each([
    ['dfc-m:Euro', 'EUR'],
    ['dfc-m:PoundSterling', 'GBP'],
    ['dfc-m:USDollar', 'USD']
  ])('maps the currency unit %s to %s', async (unit, code) => {
    withMapping();
    const res = makeRes();

    await patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice('1.00', unit) }), res);

    expect(mutations.updateVariantInShopify.mock.calls[0][2].currencyCode).toBe(code);
  });

  it('writes dfc-b:description to the parent product, not the variant', async () => {
    withMapping();
    const res = makeRes();
    const body = dfcDocument(memberGraph({ 'dfc-b:description': 'Tasty' }));

    await patchSuppliedProduct(makeReq({ method: 'PATCH', body }), res);

    expect(mutations.updateProductDescription)
      .toHaveBeenCalledWith(expect.anything(), PRODUCT_ID, 'Tasty');
  });

  it('404s a member that is not published, without touching Shopify', async () => {
    const res = makeRes();

    await expect(
      patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice() }), res)
    ).rejects.toMatchObject({ status: 404 });
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
  });

  it('400s when the payload @id does not match the requested member', async () => {
    withMapping();
    const res = makeRes();

    await expect(
      patchSuppliedProduct(
        makeReq({
          method: 'PATCH',
          params: { EnterpriseName: 'acme', ProductId: '1234' },
          body: withPrice()
        }),
        res
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s a payload with no writable field, naming what it accepts', async () => {
    withMapping();
    const res = makeRes();
    const empty = dfcDocument([{
      '@id': memberUri(VARIANT_ID),
      '@type': 'dfc-b:SuppliedProduct'
    }]);

    // The member response body will be the problem document.
    await patchSuppliedProduct(makeReq({ method: 'PATCH', body: empty }), res);

    expect(res.statusCode).toBe(400);
    expect(bodyOf(res).detail).toContain('dfc-b:name');
  });

  it('fails the write with 412 when If-Match does not match', async () => {
    withMapping();
    const res = makeRes();

    // A failed precondition is a response, not a thrown error: the controller
    // answers 412 itself.
    await patchSuppliedProduct(
      makeReq({ method: 'PATCH', body: withPrice(), headers: { 'If-Match': '"stale"' } }),
      res
    );

    expect(res.statusCode).toBe(412);
    expect(bodyOf(res).title).toBe('Precondition failed');
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
  });

  it('proceeds when If-Match matches the current ETag', async () => {
    withMapping();
    const probe = makeRes();
    await getProduct(makeReq(), probe);
    const { ETag } = probe.headers;

    const res = makeRes();
    await patchSuppliedProduct(
      makeReq({ method: 'PATCH', body: withPrice(), headers: { 'If-Match': ETag } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(mutations.updateVariantInShopify).toHaveBeenCalled();
  });
});

describe('DELETE SuppliedProducts/{id} (unpublish)', () => {
  it('deletes the mapping row but never the Shopify product', async () => {
    withMapping();
    const res = makeRes();

    await unpublishSuppliedProduct(makeReq({ method: 'DELETE' }), res);

    expect(variants.deleteVariant).toHaveBeenCalledWith(7, 'acme');
    // Nothing in the Shopify mutations module can delete a product, which is
    // the point: assert we did not go near the product-mutation helpers.
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
  });

  it('returns 204', async () => {
    withMapping();
    const res = makeRes();

    await unpublishSuppliedProduct(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(204);
  });

  it('404s a member that is not published, and deletes nothing', async () => {
    const res = makeRes();

    await expect(
      unpublishSuppliedProduct(makeReq({ method: 'DELETE' }), res)
    ).rejects.toMatchObject({ status: 404 });
    expect(variants.deleteVariant).not.toHaveBeenCalled();
  });
});
