import { OrderLine, Order, SaleSession } from '@siol-data/linkml-connector';
import loadConnectorWithResources from '../../../connector/index.js';
import * as ids from '../controllers/shopify/ids.js';
import config from '../../../config.js';
import currencyMeasureFor from '../../../utils/currencyMeasureFor.js';

/**
 * Deterministic blank-node id for an order line's Price.
 *
 * The module-wide counter this replaced advanced on *every* serialisation, so
 * two GETs of an unchanged order produced different bytes and therefore
 * different ETags — a conditional GET could never return 304. Deriving the id
 * from the order and line it belongs to makes the graph byte-identical for
 * identical data, which is what makes `If-None-Match` and `If-Match` work.
 */
const priceIdFor = (orderId, externalLineId) => `_:price_${orderId}_${externalLineId}`;

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

export async function extractOrderLine(payload) {
  const connector = await loadConnectorWithResources();

  const deserialised = asArray(connector.import(payload));
  const orderLines = deserialised.filter(
    (item) => item instanceof OrderLine
  );

  if (orderLines.length !== 1) {
    throw Error('Single OrderLine not present in graph');
  }

  return orderLines[0];
}

export async function extractOrderAndLinesAndSalesSession(payload) {
  return extract(payload, true);
}

export async function extractOrderAndLines(payload) {
  return extract(payload, false);
}

async function extract(payload, requireSalesSession) {
  const connector = await loadConnectorWithResources();

  const deserialised = asArray(connector.import(payload));

  const orders = deserialised.filter((item) => item instanceof Order);

  const lines = deserialised.filter((item) => item instanceof OrderLine);

  const saleSessions = deserialised.filter(
    (item) => item instanceof SaleSession
  );

  if (orders.length !== 1) {
    throw Error('Order missing');
  }

  const order = orders[0];

  const orderParts = Array.isArray(order.hasPart)
    ? order.hasPart
    : [order.hasPart].filter(Boolean);

  if (lines.length !== orderParts.length) {
    throw Error('Graph is missing OrderLine');
  }

  if (!requireSalesSession) {
    return order;
  }
  if (saleSessions.length !== 1) {
    throw Error('Graph must contain single SalesSession');
  }
  return { order, saleSession: saleSessions[0] };
}

function createOrderLine(
  connector,
  line,
  lineIdMappings,
  enterpriseName,
  orderId
) {
  const suppliedProduct = connector.createSuppliedProduct(
    `${config.HOST}api/dfc/Enterprises/${enterpriseName}/SuppliedProducts/${ids.extract(
      line.variant.id
    )}`
  );

  const mapping = lineIdMappings.find(
    ({ shopifyId }) => shopifyId.toString() === ids.extract(line.id)
  );
  if (!mapping) {
    throw new Error(
      `Need to do something here when the draft order contains a non dfc line.... ${line.id}`
    );
  }

  const madeUpIdForTheOfferSoTheConnectorWorks = `${config.HOST}api/dfc/Enterprises/${enterpriseName}/Offers/${ids.extract(
    line.variant.id
  )}`;

  const { amount, currencyCode } = line.originalUnitPriceSet.shopMoney;

  // Price extends QuantitativeValue in v2 (value + currency unit + vatRate).
  const price = connector.createPrice(priceIdFor(orderId, mapping.externalId), {
    value: amount,
    hasUnit: currencyMeasureFor(connector, currencyCode),
    vatRate: 0
  });

  // In v2 `dfc-b:Offer.offers` points at a CatalogItem, and the CatalogItem's
  // `references` reaches the SuppliedProduct. Pointing `offers` straight at
  // the product produces a graph a v2 hub cannot traverse, and makes a
  // consumer treat the last URI segment as a product id.
  const catalogItem = connector.createCatalogItem(
    `${suppliedProduct.semanticId}/CatalogItem`,
    {
      references: suppliedProduct.semanticId,
      hasPrice: price.semanticId
    }
  );

  const offer = connector.createOffer(madeUpIdForTheOfferSoTheConnectorWorks, {
    offers: catalogItem.semanticId,
    hasPrice: price.semanticId
  });

  return [
    suppliedProduct,
    catalogItem,
    offer,
    connector.createOrderLine(
      `${config.HOST}api/dfc/Enterprises/${enterpriseName}/Orders/${orderId}/orderLines/${mapping.externalId.toString()}`,
      {
        concerns: [offer.semanticId],
        hasPrice: price.semanticId,
        quantity: line.quantity
      }
    ),
    price
  ];
}

function createOrderLines(
  connector,
  shopifyDraftOrderResponse,
  lineIdMappings,
  enterpriseName,
  orderId
) {
  const shopifyLineItems = shopifyDraftOrderResponse.lineItems;
  return shopifyLineItems
    .filter(({ custom }) => !custom)
    .flatMap((line) => createOrderLine(
      connector,
      line,
      lineIdMappings,
      enterpriseName,
      orderId
    ));
}

async function createUnexportedDfcOrderFromShopify(
  shopifyDraftOrderResponse,
  lineIdMappings,
  enterpriseName
) {
  const connector = await loadConnectorWithResources();

  const orderId = ids.extract(shopifyDraftOrderResponse.id);

  const dfcOrderLinesGraph = createOrderLines(
    connector,
    shopifyDraftOrderResponse,
    lineIdMappings,
    enterpriseName,
    orderId
  );

  const orderLines = dfcOrderLinesGraph.filter((item) => item instanceof OrderLine);

  const order = connector.createOrder(
    `${config.HOST}api/dfc/Enterprises/${enterpriseName}/Orders/${orderId}`,
    {
      hasPart: orderLines.map((l) => l.semanticId),
      hasOrderStatus: orderStatusFor(connector, shopifyDraftOrderResponse.status),
      hasFulfilmentStatus: fulfilmentStatusFor(
        connector,
        shopifyDraftOrderResponse.order
      )
    }
  );

  return [order, ...dfcOrderLinesGraph];
}

export async function createDfcOrderFromShopify(
  shopifyDraftOrderResponse,
  lineIdMappings,
  enterpriseName
) {
  const connector = await loadConnectorWithResources();
  const graph = await createUnexportedDfcOrderFromShopify(
    shopifyDraftOrderResponse,
    lineIdMappings,
    enterpriseName
  );
  return connector.export(...graph);
}

export async function createBulkDfcOrderFromShopify(
  shopifyDraftOrderResponses,
  lineIdMappingsByDraftId,
  enterpriseName
) {
  const connector = await loadConnectorWithResources();
  const megaGraph = await Promise.all(
    shopifyDraftOrderResponses.map(async (draftOrderResponse) => {
      const lineItemIdMapping = lineIdMappingsByDraftId.find(
        ({ draftOrderId }) =>
          draftOrderId === ids.extract(draftOrderResponse.id)
      );

      if (!lineItemIdMapping) {
        return [];
      }

      return createUnexportedDfcOrderFromShopify(
        draftOrderResponse,
        lineItemIdMapping.lineItems,
        enterpriseName
      );
    })
  );

  return connector.export(...megaGraph.flat());
}

export async function createDfcOrderLinesFromShopify(
  shopifyDraftOrderResponse,
  lineIdMappings,
  enterpriseName,
  orderId
) {
  const connector = await loadConnectorWithResources();

  const dfcOrderLines = createOrderLines(
    connector,
    shopifyDraftOrderResponse,
    lineIdMappings,
    enterpriseName,
    orderId
  );

  return connector.export(...dfcOrderLines);
}

export async function createDfcOrderLineFromShopify(
  shopifyDraftOrderResponse,
  externalLineId,
  lineIdMappings,
  enterpriseName,
  orderId
) {
  const connector = await loadConnectorWithResources();

  const shopifyLineId = lineIdMappings.find(
    ({ externalId }) => externalId.toString() === externalLineId.toString()
  )?.shopifyId;

  if (!shopifyLineId) {
    return null;
  }

  const line = shopifyDraftOrderResponse.lineItems.find(
    (l) => ids.extract(l.id) === shopifyLineId
  );

  return connector.export(
    ...createOrderLine(connector, line, lineIdMappings, enterpriseName, orderId)
  );
}

function orderStatusFor(connector, shopifyDraftOrderStatus) {
  const status = {
    OPEN: 'dfc-v:Held',
    INVOICE_SENT: 'dfc-v:Held',
    COMPLETED: 'dfc-v:Complete'
  }[shopifyDraftOrderStatus];

  if (!status) {
    throw new Error(
      `Unknown connector order status mapping for ${shopifyDraftOrderStatus}`
    );
  }

  return status;
}

function fulfilmentStatusFor(connector, order) {
  if (!order || !order.displayFulfillmentStatus) {
    return null;
  }

  const status = {
    FULFILLED: 'dfc-v:Fulfilled',
    IN_PROGRESS: 'dfc-v:Unfulfilled',
    ON_HOLD: 'dfc-v:Held',
    OPEN: 'dfc-v:Unfulfilled',
    PARTIALLY_FULFILLED: 'dfc-v:Unfulfilled',
    PENDING_FULFILLMENT: 'dfc-v:Unfulfilled',
    RESTOCKED: 'dfc-v:Unfulfilled',
    SCHEDULED: 'dfc-v:Held',
    UNFULFILLED: 'dfc-v:Unfulfilled'
  }[order.displayFulfillmentStatus];

  if (!status) {
    throw new Error(
      `Unknown connector fulfilment status mapping for ${order.displayFulfillmentStatus}`
    );
  }

  return status;
}
