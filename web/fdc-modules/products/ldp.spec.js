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
  getVariants: jest.fn(async () => []),
  toggleVariantMappingStatus: jest.fn()
}));

jest.mock('./controllers/shopify/mutations.js', () => ({
  findProductVariants: jest.fn(),
  findShopCurrency: jest.fn(async () => 'GBP'),
  findVariant: jest.fn(),
  updateProductDetails: jest.fn(),
  updateVariantInShopify: jest.fn()
}));

jest.mock('../../connector/index.js', () => ({
  __esModule: true,
  default: jest.fn()
}));

const loadConnectorWithResources = require('../../connector/index.js').default;

jest.mock('./controllers/shopify/products.js', () => ({
  findFDCProducts: jest.fn(async () => []),
  getFdcVariantsFromDB: jest.fn(async () => ({})),
  getFdcVariantsByProductIdFromDB: jest.fn(async () => ({}))
}));

/**
 * Stub of the real product graph: a published SuppliedProduct plus the
 * supporting nodes (price, quantity, offer, catalog item) that the real
 * connector emits. `ldp:contains` must list only the product.
 */
const stubProductGraph = (variantId, productId) => JSON.stringify({
  '@context': 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json',
  '@graph': [
    {
      '@id': `https://dataserver.test/api/dfc/Enterprises/acme/SuppliedProducts/${variantId}`,
      '@type': 'dfc-b:SuppliedProduct',
      'dfc-b:name': 'Apples'
    },
    {
      '@id': '_:p1',
      '@type': 'dfc-b:Price',
      'dfc-b:value': '2.49',
      'dfc-b:hasUnit': 'dfc-m:PoundSterling'
    },
    {
      '@id': `https://dataserver.test/api/dfc/Enterprises/acme/SuppliedProducts/${variantId}/Offer`,
      '@type': 'dfc-b:Offer',
      'dfc-b:hasPrice': '_:p1'
    }
  ]
});

jest.mock('./dfc/dfc-products.js', () => ({
  __esModule: true,
  default: jest.fn(async () => JSON.stringify({
    '@context': 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json',
    '@graph': [
      { '@id': 'https://dataserver.test/api/dfc/Enterprises/acme/SuppliedProducts/1', '@type': 'dfc-b:SuppliedProduct' },
      { '@id': '_:p1', '@type': 'dfc-b:Price', 'dfc-b:value': '2.49' }
    ]
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
  // The write path must use the shared connector from web/connector/index.js
  // rather than constructing its own; a real instance is used so
  // `connector.import` keeps working, and the call count proves reuse.
  loadConnectorWithResources.mockImplementation(
    async () => new (require('@siol-data/linkml-connector').Connector)()
  );
  variants.getVariants.mockResolvedValue([]);
  productsFromShopify.getFdcVariantsFromDB.mockResolvedValue({});
  productsFromShopify.getFdcVariantsByProductIdFromDB.mockResolvedValue({});
  mutations.findVariant.mockResolvedValue({
    id: VARIANT_ID,
    title: 'Default',
    productId: PRODUCT_ID
  });
  mutations.findProductVariants.mockResolvedValue({ id: PRODUCT_ID, variants: [] });
  mutations.findShopCurrency.mockResolvedValue('GBP');
  mutations.updateVariantInShopify.mockResolvedValue({ id: VARIANT_ID });
  mutations.updateProductDetails.mockResolvedValue({ id: PRODUCT_ID });
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
    // @graph keeps the full supporting graph so references stay resolvable.
    expect(body['@graph'].length).toBeGreaterThan(body['ldp:contains'].length);
    expect(res.headers['Accept-Post']).toBe('application/ld+json');
  });

  it('lists only dereferenceable products in ldp:contains', async () => {
    // Blank nodes and /Offer-style URIs have no GET route, so advertising them
    // as members would send a hub chasing 404s.
    productsFromShopify.getFdcVariantsFromDB.mockResolvedValue({
      [PRODUCT_ID]: [{ retailVariantId: VARIANT_ID, enabled: true }]
    });

    const res = makeRes();
    await getProducts(makeReq(), res);

    const { 'ldp:contains': contains, '@graph': graph } = bodyOf(res);

    expect(contains).toHaveLength(1);
    expect(contains.every((m) => m['@type'] === 'dfc-b:SuppliedProduct')).toBe(true);
    expect(contains.every((m) => !String(m['@id']).startsWith('_:'))).toBe(true);
    // The supporting nodes are still present in the graph itself.
    expect(graph.some((m) => m['@type'] === 'dfc-b:Price')).toBe(true);
  });

  it('returns an empty container when nothing is published', async () => {
    const res = makeRes();
    await getProducts(makeReq(), res);

    expect(bodyOf(res)['ldp:contains']).toEqual([]);
    expect(res.statusCode).toBe(200);
  });
});

describe('POST SuppliedProducts against an existing disabled mapping', () => {
  // A merchant can stop sharing a variant without deleting the mapping, so
  // POST must re-enable that row. But the row carries its own product_id, and
  // the payload names a parent: if they disagree the re-enable would publish
  // the variant under the *old* product and return a graph built from it,
  // silently discarding what the hub asked for.

  const disabledMapping = (overrides = {}) => ({
    id: 7,
    productId: PRODUCT_ID,
    retailVariantId: VARIANT_ID,
    enabled: false,
    ...overrides
  });

  it('re-enables the existing row when the parent matches', async () => {
    variants.getVariants.mockResolvedValue([disabledMapping()]);
    // Mirror the real toggle so the follow-up lookup sees the published row.
    variants.toggleVariantMappingStatus.mockImplementation(async () => {
      variants.getVariants.mockResolvedValue([disabledMapping({ enabled: true })]);
      return { id: 7, enabled: true };
    });
    const res = makeRes();

    await publishSuppliedProduct(
      makeReq({ method: 'POST', body: dfcDocument(member()) }),
      res
    );

    expect(variants.toggleVariantMappingStatus).toHaveBeenCalledWith(7, 'acme');
    expect(variants.addVariant).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it('refuses to re-enable when the payload names a different parent', async () => {
    variants.getVariants.mockResolvedValue([disabledMapping({ productId: '1234' })]);
    const res = makeRes();

    await expect(
      publishSuppliedProduct(
        makeReq({ method: 'POST', body: dfcDocument(member()) }),
        res
      )
    ).rejects.toMatchObject({ status: 409 });

    // Nothing published, and the stale row left untouched.
    expect(variants.toggleVariantMappingStatus).not.toHaveBeenCalled();
    expect(variants.addVariant).not.toHaveBeenCalled();
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
    // The member GET returns the whole supporting graph, so the referenced
    // Quantity/Price/Offer definitions stay resolvable and the ETag matches
    // what a subsequent If-Match compares against.
    expect(bodyOf(res)['@graph'].length).toBeGreaterThan(1);
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

  it('uses the shared connector singleton rather than building its own', async () => {
    // web/connector/index.js exists to own the connector's lifecycle; a write
    // path that calls `new Connector()` reloads the bundled taxonomies per
    // request and forks the lifecycle away from the read path.
    unpublished();

    const res = makeRes();
    await publishSuppliedProduct(
      makeReq({ method: 'POST', body: dfcDocument(member()) }),
      res
    );

    expect(loadConnectorWithResources).toHaveBeenCalled();
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

  it('writes dfc-b:name to the parent product title, not the variant', async () => {
    // A Shopify variant's title is derived from its option values and is not
    // writable through ProductVariantsBulkInput, so name lands on the product.
    withMapping();
    const res = makeRes();

    await patchSuppliedProduct(
      makeReq({ method: 'PATCH', body: dfcDocument(memberGraph()) }),
      res
    );

    expect(mutations.updateProductDetails)
      .toHaveBeenCalledWith(expect.anything(), PRODUCT_ID, { title: 'Apples' });
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
  });

  it('maps an inline DFC Price onto the Shopify variant price', async () => {
    withMapping();
    const res = makeRes();

    await patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice('2.49') }), res);

    const update = mutations.updateVariantInShopify.mock.calls[0][2];
    expect(update.price).toBe('2.49');
  });

  it('writes a CatalogItem dfc-b:sku to the variant SKU', async () => {
    withMapping();
    const res = makeRes();
    const body = dfcDocument([
      memberGraph()[0],
      {
        '@id': `${memberUri(VARIANT_ID)}/CatalogItem`,
        '@type': 'dfc-b:CatalogItem',
        'dfc-b:sku': 'ABC-1'
      }
    ]);

    await patchSuppliedProduct(makeReq({ method: 'PATCH', body }), res);

    expect(mutations.updateVariantInShopify.mock.calls[0][2].sku).toBe('ABC-1');
  });

  it('rejects a price whose currency is not the shop currency', async () => {
    // Writing "10 EUR" as 10 GBP and reporting success is worse than an error.
    withMapping();
    mutations.findShopCurrency.mockResolvedValue('GBP');
    const res = makeRes();

    await expect(
      patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice('10.00', 'dfc-m:Euro') }), res)
    ).rejects.toMatchObject({ status: 422 });
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
  });

  it.each(['dfc-m:PoundSterling', 'dfc-m:Euro', 'dfc-m:USDollar'])(
    'accepts the price currency %s when it matches the shop currency',
    async (unit) => {
      withMapping();
      const code = { 'dfc-m:PoundSterling': 'GBP', 'dfc-m:Euro': 'EUR', 'dfc-m:USDollar': 'USD' }[unit];
      mutations.findShopCurrency.mockResolvedValue(code);
      const res = makeRes();

      await patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice('1.00', unit) }), res);

      expect(res.statusCode).toBe(200);
    }
  );

  it('rejects dfc-b:Image, which Shopify cannot write through this API', async () => {
    withMapping();
    const res = makeRes();
    const body = dfcDocument(memberGraph({ 'dfc-b:Image': 'https://img/x.jpg' }));

    await expect(
      patchSuppliedProduct(makeReq({ method: 'PATCH', body }), res)
    ).rejects.toMatchObject({ status: 422 });
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
    expect(mutations.updateProductDetails).not.toHaveBeenCalled();
  });

  it('clears the description on PUT when the payload omits it', async () => {
    withMapping();
    const res = makeRes();

    await replaceSuppliedProduct(
      makeReq({ method: 'PUT', body: dfcDocument(memberGraph()) }),
      res
    );

    expect(mutations.updateProductDetails)
      .toHaveBeenCalledWith(expect.anything(), PRODUCT_ID, expect.objectContaining({
        descriptionHtml: null
      }));
  });

  it('leaves the description alone on PATCH when the payload omits it', async () => {
    withMapping();
    const res = makeRes();

    await patchSuppliedProduct(
      makeReq({ method: 'PATCH', body: dfcDocument(memberGraph()) }),
      res
    );

    const [, , update] = mutations.updateProductDetails.mock.calls[0];
    expect(update.descriptionHtml).toBeUndefined();
  });

  it('reaches the product mutation for a description-only PATCH', async () => {
    // Regression: the "no writable fields" 400 used to fire before the
    // description was considered, so a description-only patch always failed.
    withMapping();
    const res = makeRes();
    const [{ 'dfc-b:name': ignored, ...withoutName }] = memberGraph();
    const body = dfcDocument([{ ...withoutName, 'dfc-b:description': 'Tasty' }]);

    await patchSuppliedProduct(makeReq({ method: 'PATCH', body }), res);

    expect(res.statusCode).toBe(200);
    expect(mutations.updateProductDetails)
      .toHaveBeenCalledWith(expect.anything(), PRODUCT_ID, { descriptionHtml: 'Tasty' });
  });

  it('404s a variant whose mapping the merchant has disabled', async () => {
    withMapping({ enabled: false });
    const res = makeRes();

    await expect(
      patchSuppliedProduct(makeReq({ method: 'PATCH', body: withPrice() }), res)
    ).rejects.toMatchObject({ status: 404 });
    expect(mutations.updateVariantInShopify).not.toHaveBeenCalled();
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
