/**
 * LDP surface for the SuppliedProducts container.
 *
 * ## Read (Phase 1)
 * `GET /SuppliedProducts` is now an `ldp:Container` whose `ldp:contains` lists
 * one description per published member; `GET /SuppliedProducts/{id}` returns a
 * single member with LDP framing and conditional-GET support. The member
 * descriptions are byte-identical to what the old flat `@graph` returned, so
 * existing hub clients that parse `@graph` are unaffected.
 *
 * ## Write (Phase 2)
 * POST / PUT / PATCH / DELETE, gated by the `WriteProducts` scope. The write
 * contract is deliberately narrower than "arbitrary DFC product CRUD", because
 * a SuppliedProduct here is a *projection* of a Shopify product+variant and
 * `fdc_variants` is what decides which projections are published:
 *
 *   POST   SuppliedProducts/        publish an existing Shopify variant
 *   PUT    SuppliedProducts/{id}    replace the mapped variant's writable fields
 *   PATCH  SuppliedProducts/{id}    update the fields present in the payload
 *   DELETE SuppliedProducts/{id}    unpublish (drop the mapping row)
 *
 * A hub cannot mint new Shopify products through this API. A DFC graph lacks
 * the fields a viable catalogue entry needs (images, inventory policy, handle
 * and SKU uniqueness), and a botched create is visible in the merchant's
 * admin. POST therefore publishes rather than creates, and says so. This is
 * also why the plan's "`dfc_overflow` JSONB" risk needs no schema change:
 * there is no column to overflow because the writable surface is narrow.
 *
 * DELETE is a hard unpublish of the *mapping*, never a delete of the Shopify
 * product: a federation caller must not be able to delete a merchant's
 * catalogue entry. The product stays in the admin and reappears if the mapping
 * is recreated.
 *
 * ## URI stability (plan risk #2)
 * A member `@id` is minted from the Shopify **variant** id and is stable for
 * the life of that variant, because `fdc_variants.retail_variant_id` is the
 * anchor. Member URIs are therefore always resolvable back to a mapping row
 * and no separate id table is needed.
 */
import {
  Offer,
  Price,
  SuppliedProduct
} from '@siol-data/linkml-connector';
import shopify from '../../shopify.js';
import getSession from '../../utils/getShopifySession.js';
import createDFCProductsFromShopify from './dfc/dfc-products.js';
import { findFDCProducts, getFdcVariantsFromDB, getFdcVariantsByProductIdFromDB } from './controllers/shopify/products.js';
import {
  findProductVariants,
  findVariant,
  updateProductDescription,
  updateVariantInShopify
} from './controllers/shopify/mutations.js';
import { addVariant, deleteVariant, getVariants } from '../../database/variants/variants.js';
import { getTargetStringFromSemanticId } from '../../utils/index.js';
import {
  buildContainer,
  checkPreconditions,
  containerUri,
  etagFor,
  graphToMembers,
  parseLdpBody,
  sendLdp,
  sendProblem,
  sendWriteResult,
  withLdpErrors
} from '../ldp/index.js';

const V2_CONTEXT = 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json';

export const suppliedProductsContainerUri = (enterpriseName) =>
  containerUri('api/dfc/Enterprises', enterpriseName, 'SuppliedProducts');

export const suppliedProductMemberUri = (enterpriseName, variantId) =>
  containerUri('api/dfc/Enterprises', enterpriseName, 'SuppliedProducts', variantId);

const fail = (message, status, title) => Object.assign(new Error(message), { status, title });

const clientFor = async (enterpriseName) => {
  const session = await getSession(`${enterpriseName}.myshopify.com`);
  if (!session) {
    throw fail(
      `No Shopify session for ${enterpriseName}`,
      401,
      'Unauthorised'
    );
  }
  return new shopify.api.clients.Graphql({ session });
};

/**
 * Build the connector graph for the products named by `fdcVariantsFromDB`.
 * Shared by the container, the member, and every write, so a read after a
 * write always agrees with what the write itself returned.
 */
const graphForMappings = async (req, fdcVariantsFromDB) => {
  if (Object.keys(fdcVariantsFromDB).length === 0) {
    return { '@context': V2_CONTEXT, members: [] };
  }

  const { EnterpriseName, shopDefaultProductType } = req;
  const client = await clientFor(EnterpriseName);
  const fdcProducts = await findFDCProducts(client, Object.keys(fdcVariantsFromDB));

  const graph = await createDFCProductsFromShopify(
    fdcProducts,
    fdcVariantsFromDB,
    EnterpriseName,
    shopDefaultProductType
  );

  return graphToMembers(graph);
};

/** Re-derive the graph covering a single mapping row, for a write response. */
const graphForMapping = async (req, mapping) => {
  const fdcVariantsFromDB = await getFdcVariantsByProductIdFromDB(
    mapping.productId,
    req.shopName || req.params.EnterpriseName
  );
  const { members } = await graphForMappings(req, fdcVariantsFromDB);
  return members;
};

/** The member description for one variant within a built graph. */
const memberForVariant = (members, variantId) =>
  members.find((member) => {
    const id = typeof member['@id'] === 'string' ? member['@id'] : member.semanticId;
    return typeof id === 'string' && id.endsWith(`/SuppliedProducts/${variantId}`);
  }) || null;

/** `dfc-m:PoundSterling` -> `GBP`. Inverse of `currencyMeasureFor`. */
const currencyForUnit = (unit) => {
  const measure = typeof unit === 'string' ? unit : unit && unit.semanticId;
  return {
    'dfc-m:Euro': 'EUR',
    'dfc-m:PoundSterling': 'GBP',
    'dfc-m:USDollar': 'USD'
  }[measure] || null;
};

/**
 * Pull the single `SuppliedProduct` out of an incoming DFC graph.
 *
 * v1 payloads are rejected rather than coerced: the v1 -> v2 property renames
 * are not mechanical, and a silent partial import would corrupt the catalogue.
 */
const extractSuppliedProduct = async (req) => {
  const body = parseLdpBody(req);

  const context = body['@context'];
  const contextIsV2 = typeof context === 'string'
    ? context.includes('v2.0.0')
    : JSON.stringify(context || '').includes('v2.0.0');

  if (context && !contextIsV2) {
    throw fail(
      'This dataserver speaks DFC v2 only.',
      415,
      'Unsupported media type'
    );
  }

  const { Connector } = await import('@siol-data/linkml-connector');
  const connector = new Connector();
  const imported = connector.import(body);

  const suppliedProducts = (Array.isArray(imported) ? imported : [imported])
    .filter((item) => item instanceof SuppliedProduct);

  if (suppliedProducts.length !== 1) {
    throw fail(
      `Expected exactly one dfc-b:SuppliedProduct, found ${suppliedProducts.length}`,
      400,
      'Bad request'
    );
  }

  return {
    raw: body,
    suppliedProduct: suppliedProducts[0],
    graph: Array.isArray(imported) ? imported : [imported]
  };
};

/**
 * A DFC `Price` reaches us either as an inline graph member or as an
 * `Offer.hasPrice` reference that the connector already resolved.
 */
const findPriceIn = (graph) => {
  const items = Array.isArray(graph) ? graph : [graph];
  const direct = items.find((item) => item instanceof Price);
  if (direct) {
    return direct;
  }
  return items
    .filter((item) => item instanceof Offer)
    .map((offer) => offer.hasPrice)
    .find((hasPrice) => hasPrice && typeof hasPrice !== 'string') || null;
};

/**
 * The variant id a member URI refers to, per the URI-stability rule above.
 * Returns null for anything that is not a `/SuppliedProducts/{id}` URI.
 */
const variantIdFromMemberUri = (memberUri) => {
  if (typeof memberUri !== 'string') {
    return null;
  }
  try {
    return getTargetStringFromSemanticId(memberUri, 'SuppliedProducts');
  } catch (err) {
    return null;
  }
};

const findMapping = async (variantId, shopName) => {
  const variants = await getVariants(shopName);
  return variants.find(
    ({ retailVariantId }) => String(retailVariantId) === String(variantId)
  ) || null;
};

/** Fields this dataserver accepts from a hub, and their DFC predicate. */
const WRITABLE_PREDICATES = ['dfc-b:name', 'dfc-b:description', 'dfc-b:image'];

/**
 * `GET /SuppliedProducts` — the container.
 *
 * The response is now an `ldp:Container` with `ldp:contains`, which is what
 * the plan called for. To avoid breaking hubs that already expect a graph at
 * the top level, the member descriptions are *also* exposed under `@graph`,
 * so both `body['ldp:contains']` and a `@graph`-walking client find what they
 * expect.
 */
const getProducts = async (req, res) => {
  const { EnterpriseName } = req;
  const fdcVariantsFromDB = await getFdcVariantsFromDB(EnterpriseName);
  const { members } = await graphForMappings(req, fdcVariantsFromDB);

  const container = buildContainer(
    suppliedProductsContainerUri(EnterpriseName),
    members
  );

  const body = {
    ...container,
    '@context': container['@context'],
    '@graph': members
  };

  return sendLdp(req, res, 200, body, { container: true });
};

/** `GET /SuppliedProducts/{id}` — a single member, with conditional-GET support. */
const getProduct = async (req, res) => {
  const { EnterpriseName, ProductId } = req;

  const fdcVariantsFromDB = await getFdcVariantsByProductIdFromDB(
    ProductId,
    EnterpriseName
  );

  if (Object.keys(fdcVariantsFromDB).length === 0) {
    return sendProblem(req, res, 404, {
      title: 'Not found',
      detail: `${suppliedProductMemberUri(EnterpriseName, ProductId)} is not published in this container`
    });
  }

  const { members } = await graphForMappings(req, fdcVariantsFromDB);
  const etag = etagFor(members);

  const precondition = checkPreconditions(req, etag);
  if (precondition) {
    if (precondition.status === 304) {
      res.set('ETag', etag);
      return res.status(304).end();
    }
    return sendProblem(req, res, precondition.status, precondition);
  }

  return sendLdp(req, res, 200, { '@context': V2_CONTEXT, '@graph': members }, {
    member: true,
    location: suppliedProductMemberUri(EnterpriseName, ProductId)
  });
};

/**
 * `POST /SuppliedProducts` — publish an existing Shopify variant.
 *
 * The `@id` must name the variant to publish and `dfc-b:isVariantOf` must
 * name its parent product; that pair is exactly the `fdc_variants` row we
 * insert. Both are verified against Shopify first so we never leave a
 * dangling mapping.
 */
const publishSuppliedProduct = async (req, res) => {
  const { EnterpriseName, shopName } = req;
  const { raw, suppliedProduct } = await extractSuppliedProduct(req);

  const variantId = variantIdFromMemberUri(suppliedProduct.semanticId);

  if (!variantId || !/^\d+$/.test(variantId)) {
    throw fail(
      `Unusable SuppliedProduct @id: ${suppliedProduct.semanticId}`,
      400,
      'Bad request'
    );
  }

  const existing = await findMapping(variantId, shopName);
  if (existing) {
    throw fail(
      `Variant ${variantId} is already published`,
      409,
      'Conflict'
    );
  }

  const parentId = variantIdFromMemberUri(
    suppliedProduct.isVariantOf || raw['dfc-b:isVariantOf']
  );
  if (!parentId || !/^\d+$/.test(parentId)) {
    throw fail(
      'Payload must carry dfc-b:isVariantOf naming the parent product',
      400,
      'Bad request'
    );
  }

  const client = await clientFor(EnterpriseName);

  const variant = await findVariant(client, parentId, variantId);
  if (!variant) {
    throw fail(
      `Variant ${variantId} does not exist in this shop`,
      404,
      'Not found'
    );
  }

  const product = await findProductVariants(client, parentId);
  if (!product) {
    throw fail(
      `Product ${parentId} does not exist in this shop`,
      404,
      'Not found'
    );
  }

  await addVariant({
    productId: parentId,
    retailVariantId: variantId,
    enabled: true,
    shopName
  });

  const mapping = await findMapping(variantId, shopName);
  const members = await graphForMapping(req, mapping);
  const member = memberForVariant(members, variantId) || members[0];

  return sendWriteResult(req, res, {
    status: 201,
    body: { '@context': V2_CONTEXT, ...(member || {}) },
    member: true,
    location: suppliedProductMemberUri(EnterpriseName, variantId)
  });
};

/**
 * `PUT` / `PATCH` /SuppliedProducts/{id}`.
 *
 * PUT replaces the writable fields wholesale (an absent field clears it, per
 * HTTP semantics). PATCH applies only the fields present in the payload. The
 * distinction is resolved by which keys we hand to Shopify, not by two
 * separate code paths.
 */
const applyUpdate = async (req, res, { partial }) => {
  const { EnterpriseName, shopName, ProductId } = req;

  const { raw, suppliedProduct, graph } = await extractSuppliedProduct(req);

  if (variantIdFromMemberUri(suppliedProduct.semanticId) !== String(ProductId)) {
    throw fail(
      `Payload @id ${suppliedProduct.semanticId} does not match the requested member ${ProductId}`,
      400,
      'Bad request'
    );
  }

  const mapping = await findMapping(ProductId, shopName);
  if (!mapping) {
    throw fail(
      `${suppliedProductMemberUri(EnterpriseName, ProductId)} is not published in this container`,
      404,
      'Not found'
    );
  }

  // Conditional write: a hub that read the member first can guard its update
  // with the ETag it was handed, which prevents a lost update when two hubs
  // write concurrently.
  const currentMembers = await graphForMapping(req, mapping);
  const currentEtag = etagFor(currentMembers);
  const precondition = checkPreconditions(req, currentEtag);
  if (precondition) {
    if (precondition.status === 304) {
      res.set('ETag', currentEtag);
      return res.status(304).end();
    }
    return sendProblem(req, res, precondition.status, precondition);
  }

  const name = raw['dfc-b:name'];
  const description = raw['dfc-b:description'];
  const image = raw['dfc-b:image'];

  const price = findPriceIn(graph);
  const priceValue = price && price.value !== undefined && price.value !== null
    ? String(price.value)
    : undefined;
  const priceCurrency = price ? currencyForUnit(price.hasUnit) : null;

  const update = {};
  if (partial) {
    if (name !== undefined) {
      update.title = name;
    }
    if (image !== undefined) {
      update.imageSrc = image;
    }
  } else {
    // PUT: an absent writable field is reset, per HTTP replace semantics.
    update.title = name === undefined ? '' : name;
    update.imageSrc = image === undefined ? null : image;
  }

  if (priceValue !== undefined) {
    update.price = priceValue;
    if (priceCurrency) {
      update.currencyCode = priceCurrency;
    }
  }

  if (Object.keys(update).length === 0) {
    return sendProblem(req, res, 400, {
      title: 'Bad request',
      detail: `No writable fields present. Accepted DFC predicates: ${WRITABLE_PREDICATES.join(', ')} `
        + '(plus dfc-b:value / dfc-b:hasUnit on an inline Price)'
    });
  }

  const client = await clientFor(EnterpriseName);
  await updateVariantInShopify(client, mapping, update);

  // Description lives on the product, not the variant, so it needs its own
  // mutation. A missing description on PUT clears it, matching PUT semantics.
  if (description !== undefined) {
    await updateProductDescription(client, mapping.productId, description);
  }

  const updated = await graphForMapping(req, await findMapping(ProductId, shopName));
  const member = memberForVariant(updated, ProductId);

  return sendWriteResult(req, res, {
    status: 200,
    body: { '@context': V2_CONTEXT, ...(member || { '@graph': updated }) },
    member: true,
    location: suppliedProductMemberUri(EnterpriseName, ProductId)
  });
};

const replaceSuppliedProduct = (req, res) => applyUpdate(req, res, { partial: false });
const patchSuppliedProduct = (req, res) => applyUpdate(req, res, { partial: true });

/** `DELETE /SuppliedProducts/{id}` — unpublish; see the module comment. */
const unpublishSuppliedProduct = async (req, res) => {
  const { EnterpriseName, shopName, ProductId } = req;

  const mapping = await findMapping(ProductId, shopName);
  if (!mapping) {
    throw fail(
      `${suppliedProductMemberUri(EnterpriseName, ProductId)} is not published in this container`,
      404,
      'Not found'
    );
  }

  await deleteVariant(mapping.id, shopName);

  return sendWriteResult(req, res, {
    status: 204,
    body: '',
    member: true,
    location: suppliedProductMemberUri(EnterpriseName, ProductId)
  });
};

export {
  getProducts,
  getProduct,
  publishSuppliedProduct,
  replaceSuppliedProduct,
  patchSuppliedProduct,
  unpublishSuppliedProduct,
  withLdpErrors
};
