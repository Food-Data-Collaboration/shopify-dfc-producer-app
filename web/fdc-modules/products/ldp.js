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
  findShopCurrency,
  findVariant,
  updateProductDetails,
  updateVariantInShopify
} from './controllers/shopify/mutations.js';
import {
  addVariant,
  deleteVariant,
  getVariants,
  toggleVariantMappingStatus
} from '../../database/variants/variants.js';
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

  const { EnterpriseName } = req.params;
  const { shopDefaultProductType } = req;
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

/**
 * The response body for a member, and the ETag over it. Both the read and the
 * write paths go through this so the ETag a hub is handed is always the ETag of
 * the bytes it would get back — otherwise `If-None-Match` and `If-Match` never
 * match and every conditional request degrades to an unconditional one.
 */
const memberBody = (members) => ({ '@context': V2_CONTEXT, '@graph': members });

const memberEtag = (members) => etagFor(JSON.stringify(memberBody(members), null, 2));

/** The member description for one variant within a built graph. */
/**
 * The subset of a built graph that are *container members* — the published
 * SuppliedProducts, which are the only nodes with a GET route.
 *
 * The full graph also contains Prices, QuantitativeValues, Offers,
 * CatalogItems and transformation flows. Those are supporting nodes, not
 * members: listing them in `ldp:contains` would advertise blank-node ids
 * (`_:p1`) and URIs like `…/Offer` as members that a hub would then try to
 * dereference and get a 404 from. They stay in `@graph`, so the references
 * remain resolvable, which is what a JSON-LD consumer actually needs.
 */
const containerMembersOf = (members) =>
  members.filter((member) => {
    const id = typeof member['@id'] === 'string' ? member['@id'] : member.semanticId;
    if (typeof id !== 'string' || id.startsWith('_:')) {
      return false;
    }
    return member['@type'] === 'dfc-b:SuppliedProduct'
      || member.semanticType === 'dfc-b:SuppliedProduct';
  });

/** `dfc-m:PoundSterling` -> `GBP`. Inverse of `currencyMeasureFor`. */
const currencyForUnit = (unit) => {
  const measure = typeof unit === 'string' ? unit : unit && unit.semanticId;
  return {
    'dfc-m:Euro': 'EUR',
    'dfc-m:PoundSterling': 'GBP',
    'dfc-m:USDollar': 'USD'
  }[measure] || null;
};

/** Flatten a JSON-LD document into its member descriptions. */
const rawMembersOf = (body) => {
  if (Array.isArray(body)) {
    return body;
  }

  const { '@graph': graph, ...rest } = body;

  if (!graph) {
    return [rest];
  }
  return Array.isArray(graph) ? graph : [graph];
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
    // The wire-form members, which is where the fields we write from are read
    // out. The connector's import drops anything not modelled in v2 (notably
    // `isVariantOf`, which we register manually only for *export*), so a hub's
    // parent link is only visible in the raw document.
    rawMembers: rawMembersOf(body),
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

/**
 * The mapping row for a variant the merchant has actually shared.
 *
 * `getVariants` returns disabled rows too — a merchant can stop sharing a
 * variant without deleting the mapping — so a truthy `findMapping` result does
 * not mean "published". Treating it as if it did let PUT/PATCH modify variants
 * the merchant had withdrawn, and made POST report "already published" for a
 * variant that was not.
 */
const findPublishedMapping = async (variantId, shopName) => {
  const mapping = await findMapping(variantId, shopName);
  return mapping && mapping.enabled ? mapping : null;
};

/**
 * DFC predicates this dataserver accepts in a write, advertised in the 400/422
 * problem detail so a hub can discover the contract without guessing.
 *
 * `dfc-b:value`/`dfc-b:hasUnit` (on an inline Price) and `dfc-b:sku` (on the
 * CatalogItem) are writable too but are listed separately in the message
 * because they do not appear on the SuppliedProduct itself.
 */
const WRITABLE_PREDICATES = ['dfc-b:name', 'dfc-b:description'];

/**
 * `GET /SuppliedProducts` — the container.
 *
 * `ldp:contains` lists only the published SuppliedProducts (the nodes that
 * have a GET route); `@graph` carries the complete graph including Offers,
 * CatalogItems, Prices and quantities, so references stay resolvable.
 */
const getProducts = async (req, res) => {
  const { EnterpriseName } = req.params;
  const fdcVariantsFromDB = await getFdcVariantsFromDB(EnterpriseName);
  const { members } = await graphForMappings(req, fdcVariantsFromDB);

  const container = buildContainer(
    suppliedProductsContainerUri(EnterpriseName),
    containerMembersOf(members)
  );

  const body = {
    ...container,
    '@context': container['@context'],
    '@graph': members
  };

  return sendLdp(req, res, 200, body, { container: true, writable: true });
};

/**
 * `GET /SuppliedProducts/{id}` — a single member, with conditional-GET support.
 *
 * The id may be either a Shopify **variant** id (what every `@id` we publish
 * uses, so this is what a hub dereferencing a member URI will send) or a
 * **product** id (the historical route shape, kept so existing hub bookmarks
 * keep working). Resolve a variant id through `fdc_variants` first — querying
 * `product_id` directly returns nothing whenever the two differ, which 404s
 * every member URI we have ever handed out.
 */
const getProduct = async (req, res) => {
  const { EnterpriseName, ProductId } = req.params;
  const { shopName } = req;

  const mapping = await findPublishedMapping(ProductId, shopName);
  const fdcVariantsFromDB = mapping
    ? await getFdcVariantsByProductIdFromDB(mapping.productId, EnterpriseName)
    : await getFdcVariantsByProductIdFromDB(ProductId, EnterpriseName);

  if (Object.keys(fdcVariantsFromDB).length === 0) {
    return sendProblem(req, res, 404, {
      title: 'Not found',
      detail: `${suppliedProductMemberUri(EnterpriseName, ProductId)} is not published in this container`
    });
  }

  const { members } = await graphForMappings(req, fdcVariantsFromDB);
  const location = suppliedProductMemberUri(EnterpriseName, ProductId);
  const etag = memberEtag(members);

  const precondition = checkPreconditions(req, etag);
  if (precondition) {
    if (precondition.status === 304) {
      res.set('ETag', etag);
      return res.status(304).end();
    }
    return sendProblem(req, res, precondition.status, precondition);
  }

  return sendLdp(req, res, 200, memberBody(members), { member: true, writable: true, location });
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
  const { EnterpriseName } = req.params;
  const { shopName } = req;
  const { rawMembers, suppliedProduct } = await extractSuppliedProduct(req);

  const variantId = variantIdFromMemberUri(suppliedProduct.semanticId);

  if (!variantId || !/^\d+$/.test(variantId)) {
    throw fail(
      `Unusable SuppliedProduct @id: ${suppliedProduct.semanticId}`,
      400,
      'Bad request'
    );
  }

  const existing = await findMapping(variantId, shopName);
  if (existing && existing.enabled) {
    throw fail(
      `Variant ${variantId} is already published`,
      409,
      'Conflict'
    );
  }

  const parentId = variantIdFromMemberUri(suppliedProduct.isVariantOf)
    || variantIdFromMemberUri(
      rawMembers.find((m) => m['@id'] === suppliedProduct.semanticId)?.['dfc-b:isVariantOf']
    );
  if (!parentId || !/^\d+$/.test(parentId)) {
    throw fail(
      'Payload must carry dfc-b:isVariantOf naming the parent product',
      400,
      'Bad request'
    );
  }

  const client = await clientFor(EnterpriseName);

  // Verifies existence *and* that the variant belongs to the named parent.
  // Checking only existence let a payload name a real variant from product A
  // alongside a real parent B, producing a mapping that could never resolve.
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

  if (existing) {
    // The variant already has a mapping but the merchant had stopped sharing
    // it. Re-enable that row rather than inserting a duplicate, which would
    // violate the (product_id, retail_variant_id) unique index.
    await toggleVariantMappingStatus(existing.id, shopName);
  } else {
    await addVariant({
      productId: parentId,
      retailVariantId: variantId,
      enabled: true,
      shopName
    });
  }

  const mapping = await findPublishedMapping(variantId, shopName);
  const members = await graphForMapping(req, mapping);

  return sendWriteResult(req, res, {
    status: 201,
    body: memberBody(members),
    member: true,
    location: suppliedProductMemberUri(EnterpriseName, variantId)
  });
};

/**
 * `PUT` / `PATCH` /SuppliedProducts/{id}`.
 *
 * PUT replaces the writable fields wholesale (an absent field clears it, per
 * HTTP semantics). PATCH applies only the fields present in the payload.
 *
 * ## What is actually writable
 *
 * Shopify's `ProductVariantsBulkInput` cannot set a variant title or its image
 * (see `mutations.js`), so the writable surface is:
 *
 *   - `dfc-b:value` on an inline Price, plus `dfc-b:hasUnit` -> variant price
 *   - `dfc-b:sku` on the CatalogItem                    -> variant SKU
 *   - `dfc-b:name`                                       -> parent product title
 *   - `dfc-b:description`                                -> product descriptionHtml
 *   - `dfc-b:Image`                                      -> rejected, see below
 *
 * `dfc-b:name` lands on the *product*, not the variant, because a variant's
 * title is derived from its option values and is not directly writable.
 *
 * A price whose `dfc-b:hasUnit` does not match the shop currency is rejected
 * rather than written: silently storing "10 EUR" as "10 GBP" and reporting
 * success is worse than an error the hub can see and correct.
 */
const applyUpdate = async (req, res, { partial }) => {
  const { EnterpriseName, ProductId } = req.params;
  const { shopName } = req;

  const { rawMembers, suppliedProduct, graph } = await extractSuppliedProduct(req);

  // The member's own wire description, so a payload carrying extra members
  // (a Price, an Offer) does not confuse which fields belong to the product.
  const wireMember = rawMembers.find(
    (m) => m['@id'] === suppliedProduct.semanticId
  ) || {};

  if (variantIdFromMemberUri(suppliedProduct.semanticId) !== String(ProductId)) {
    throw fail(
      `Payload @id ${suppliedProduct.semanticId} does not match the requested member ${ProductId}`,
      400,
      'Bad request'
    );
  }

  const mapping = await findPublishedMapping(ProductId, shopName);
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
  const currentEtag = memberEtag(currentMembers);
  const precondition = checkPreconditions(req, currentEtag);
  if (precondition) {
    if (precondition.status === 304) {
      res.set('ETag', currentEtag);
      return res.status(304).end();
    }
    return sendProblem(req, res, precondition.status, precondition);
  }

  // `dfc-b:Image` is capitalised: that is what the v2 connector emits, so
  // reading `dfc-b:image` would miss every image a hub sends (and make PUT
  // clear it, because it would look absent).
  const name = wireMember['dfc-b:name'];
  const description = wireMember['dfc-b:description'];
  const image = wireMember['dfc-b:Image'] ?? wireMember['dfc-b:image'];

  if (image !== undefined) {
    throw fail(
      'dfc-b:Image is not writable through this API: Shopify attaches variant media through '
      + 'a separate mutation argument and cannot replace existing variant images. Remove it '
      + `from the payload, or update the image in Shopify. Writable predicates: ${WRITABLE_PREDICATES.join(', ')}`,
      422,
      'Unprocessable entity'
    );
  }

  const price = findPriceIn(graph);
  const priceValue = price && price.value !== undefined && price.value !== null
    ? String(price.value)
    : undefined;
  const priceCurrency = price ? currencyForUnit(price.hasUnit) : null;

  const catalogItem = rawMembers.find(
    (m) => m['@type'] === 'dfc-b:CatalogItem'
      && String(m['@id'] || '').startsWith(suppliedProduct.semanticId)
  );
  const sku = catalogItem?.['dfc-b:sku'];

  const client = await clientFor(EnterpriseName);

  // Reject a cross-currency price before writing anything.
  if (priceValue !== undefined && priceCurrency) {
    const shopCurrency = await findShopCurrency(client);
    if (shopCurrency && priceCurrency !== shopCurrency) {
      throw fail(
        `Price currency ${priceCurrency} does not match the shop currency ${shopCurrency}. `
        + 'This dataserver does not convert; send the price in the shop currency.',
        422,
        'Unprocessable entity'
      );
    }
  }

  const variantUpdate = {};
  if (priceValue !== undefined) {
    variantUpdate.price = priceValue;
  }
  if (sku !== undefined) {
    variantUpdate.sku = sku;
  }

  // Product-level fields. On PUT an absent description is cleared, per HTTP
  // replace semantics; on PATCH an absent field is left alone.
  const productUpdate = {};
  if (name !== undefined) {
    productUpdate.title = name;
  }
  if (description !== undefined) {
    productUpdate.descriptionHtml = description;
  } else if (!partial) {
    productUpdate.descriptionHtml = null;
  }

  const hasVariantUpdate = Object.keys(variantUpdate).length > 0;
  const hasProductUpdate = Object.keys(productUpdate).length > 0;

  if (!hasVariantUpdate && !hasProductUpdate) {
    return sendProblem(req, res, 400, {
      title: 'Bad request',
      detail: `No writable fields present. Accepted DFC predicates: ${WRITABLE_PREDICATES.join(', ')} `
        + '(plus dfc-b:value / dfc-b:hasUnit on an inline Price, and dfc-b:sku on the CatalogItem)'
    });
  }

  if (hasVariantUpdate) {
    await updateVariantInShopify(client, mapping, {
      ...variantUpdate,
      productId: mapping.productId
    });
  }
  if (hasProductUpdate) {
    await updateProductDetails(client, mapping.productId, productUpdate);
  }

  // Return the same complete representation the read path uses, so the ETag a
  // hub gets here is the one it will get from the next GET or If-Match.
  const updated = await graphForMapping(req, await findPublishedMapping(ProductId, shopName));

  return sendWriteResult(req, res, {
    status: 200,
    body: memberBody(updated),
    member: true,
    location: suppliedProductMemberUri(EnterpriseName, ProductId)
  });
};

const replaceSuppliedProduct = (req, res) => applyUpdate(req, res, { partial: false });
const patchSuppliedProduct = (req, res) => applyUpdate(req, res, { partial: true });

/**
 * `DELETE /SuppliedProducts/{id}` — unpublish; see the module comment.
 *
 * Honours the same conditional-request preconditions as PUT/PATCH: without
 * that, a hub holding a stale validator could remove a publication another
 * client has since changed.
 */
const unpublishSuppliedProduct = async (req, res) => {
  const { EnterpriseName, ProductId } = req.params;
  const { shopName } = req;

  const mapping = await findPublishedMapping(ProductId, shopName);
  if (!mapping) {
    throw fail(
      `${suppliedProductMemberUri(EnterpriseName, ProductId)} is not published in this container`,
      404,
      'Not found'
    );
  }

  const currentMembers = await graphForMapping(req, mapping);
  const precondition = checkPreconditions(req, memberEtag(currentMembers));
  if (precondition) {
    if (precondition.status === 304) {
      res.set('ETag', memberEtag(currentMembers));
      return res.status(304).end();
    }
    return sendProblem(req, res, precondition.status, precondition);
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
