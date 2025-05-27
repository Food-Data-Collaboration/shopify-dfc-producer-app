import { OrderLine, Order, SaleSession } from '@datafoodconsortium/connector';
import loadConnectorWithResources from '../../../connector/index.js';
import * as ids from '../controllers/shopify/ids.js';
import config from '../../../config.js';
import currencyMeasureFor from '../../../utils/currencyMeasureFor.js';

export async function extractOrderLine(payload) {
  const connector = await loadConnectorWithResources();

  const orderLines = (await connector.import(payload)).filter(
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

  const deserialised = await connector.import(payload);

  const orders = deserialised.filter((item) => item instanceof Order);

  const lines = deserialised.filter((item) => item instanceof OrderLine);

  const saleSessions = deserialised.filter(
    (item) => item instanceof SaleSession
  );

  if (orders.length !== 1) {
    throw Error('Order missing');
  }

  const order = orders[0];

  if ((await order.getLines()).length !== lines.length) {
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
  const suppliedProduct = connector.createSuppliedProduct({
    semanticId: `${
      config.HOST
    }api/dfc/Enterprises/${enterpriseName}/SuppliedProducts/${ids.extract(
      line.variant.id
    )}`
  });

  const mapping = lineIdMappings.find(
    ({ shopifyId }) => shopifyId.toString() === ids.extract(line.id)
  );
  if (!mapping) {
    throw new Error(
      `Need to do something here when the draft order contains a non dfc line.... ${line.id}`
    );
  }

  const madeUpIdForTheOfferSoTheConnectorWorks = `${
    config.HOST
  }api/dfc/Enterprises/${enterpriseName}/Offers/${ids.extract(
    line.variant.id
  )}`;

  const offer = connector.createOffer({
    semanticId: madeUpIdForTheOfferSoTheConnectorWorks,
    offeredItem: suppliedProduct
  });

  const { amount, currencyCode } = line.originalUnitPriceSet.shopMoney;

  const price = connector.createPrice({
    value: amount,
    unit: currencyMeasureFor(connector, currencyCode)
  });

  return [
    suppliedProduct,
    offer,
    connector.createOrderLine({
      semanticId: `${
        config.HOST
      }api/dfc/Enterprises/${enterpriseName}/Orders/${orderId}/orderLines/${mapping.externalId.toString()}`,
      offer,
      price,
      quantity: line.quantity
    })
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

  const order = connector.createOrder({
    semanticId: `${config.HOST}api/dfc/Enterprises/${enterpriseName}/Orders/${orderId}`,
    lines: dfcOrderLinesGraph.filter((item) => item instanceof OrderLine),
    orderStatus: orderStatusFor(connector, shopifyDraftOrderResponse.status),
    fulfilmentStatus: fulfilmentStatusFor(
      connector,
      shopifyDraftOrderResponse.order
    )
  });

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
  return connector.export(graph);
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

  return connector.export(megaGraph.flat());
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

  return connector.export(dfcOrderLines);
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
    createOrderLine(connector, line, lineIdMappings, enterpriseName, orderId)
  );
}

function orderStatusFor(connector, shopifyDraftOrderStatus) {
  const status = {
    OPEN: connector.VOCABULARY.STATES.ORDERSTATE.HELD,
    INVOICE_SENT: connector.VOCABULARY.STATES.ORDERSTATE.HELD,
    COMPLETED: connector.VOCABULARY.STATES.ORDERSTATE.COMPLETE
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
    FULFILLED: connector.VOCABULARY.STATES.FULFILMENTSTATE.FULFILLED,
    IN_PROGRESS: connector.VOCABULARY.STATES.FULFILMENTSTATE.UNFULFILLED,
    ON_HOLD: connector.VOCABULARY.STATES.FULFILMENTSTATE.HELD,
    OPEN: connector.VOCABULARY.STATES.FULFILMENTSTATE.UNFULFILLED,
    PARTIALLY_FULFILLED:
      connector.VOCABULARY.STATES.FULFILMENTSTATE.UNFULFILLED,
    PENDING_FULFILLMENT:
      connector.VOCABULARY.STATES.FULFILMENTSTATE.UNFULFILLED,
    RESTOCKED: connector.VOCABULARY.STATES.FULFILMENTSTATE.UNFULFILLED,
    SCHEDULED: connector.VOCABULARY.STATES.FULFILMENTSTATE.HELD,
    UNFULFILLED: connector.VOCABULARY.STATES.FULFILMENTSTATE.UNFULFILLED
  }[order.displayFulfillmentStatus];

  if (!status) {
    throw new Error(
      `Unknown connector fulfilment status mapping for ${order.displayFulfillmentStatus}`
    );
  }

  return status;
}
