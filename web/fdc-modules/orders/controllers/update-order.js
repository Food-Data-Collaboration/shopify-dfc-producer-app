import * as database from '../../../database/orders/orders.js';
import { loadSalesSession } from '../../../database/sales_sessions/salesSessions.js';
import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import {
  createDfcOrderFromShopify,
  extractOrderAndLines
} from '../dfc/dfc-order.js';
import { persistLineIdMappings } from './lineItemMappings.js';
import * as ids from './shopify/ids.js';
import * as shopifyOrders from './shopify/orders.js';
import { orderForbidden, orderNotFound, sendOrderWrite } from '../ldp.js';
import { sendProblem, withLdpErrors } from '../../ldp/index.js';

async function retry(fn, retries = 3, delayMs = 1000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= retries) { throw err; }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => { setTimeout(res, delayMs); }); // Wait before retrying
    }
  }
}

const updateOrder = async (req, res) => {
  const orderMetadata = await database.getOrder(
    req.params.id,
    req.user.id,
    req.params.EnterpriseName
  );

  if (!orderMetadata) {
    return orderForbidden(req, res);
  }

  const session = await getSession(
    `${req.params.EnterpriseName}.myshopify.com`
  );
  const client = new shopify.api.clients.Graphql({ session });

  const order = await extractOrderAndLines(req.body);

  if (ids.extract(order.semanticId) !== req.params.id) {
    return sendProblem(req, res, 400, {
      title: 'Bad request',
      detail: 'ID does not match payload'
    });
  }

  const { order: shopifyOrder } = await shopifyOrders.findOrder(
    client,
    req.params.id,
    {}
  );

  if (!shopifyOrder) {
    return orderNotFound(req, res);
  }

  const salesSession = await loadSalesSession(req.params.id, req.params.EnterpriseName);

  if (!salesSession) {
    return sendProblem(req, res, 500, {
      title: 'Internal server error',
      detail: 'Unable to find sales session'
    });
  }

  const shopifyDraftOrder = await updateShopifyDraftOrder(
    client,
    order,
    new Date(salesSession.reservationDate),
    req.params.EnterpriseName
  );

  const lineItemIdMappings = await persistLineIdMappings(
    shopifyDraftOrder,
    req.params.EnterpriseName
  );
  const dfcOrder = await createDfcOrderFromShopify(
    shopifyDraftOrder,
    lineItemIdMappings,
    req.params.EnterpriseName
  );

  return sendOrderWrite(req, res, dfcOrder);
};

async function updateShopifyDraftOrder(client, order, reservationDate, enterprise) {
  const dfcLines = Array.isArray(order.hasPart)
    ? order.hasPart
    : [order.hasPart].filter(Boolean);

  const shopifyLines = (
    await Promise.all(dfcLines.map(shopifyOrders.dfcLineToShopifyLine))
  ).filter(({ quantity }) => quantity > 0);

  const orderId = ids.extract(order.semanticId);
  const shopifyDraftOrder = await shopifyOrders.updateOrder(
    client,
    orderId,
    reservationDate,
    shopifyLines
  );
  if (order.hasOrderStatus === 'dfc-v:Complete') {
    const completedOrder = await retry(() => shopifyOrders.completeDraftOrder(
      client,
      orderId
    ), 10, 300);

    await database.completeDraftOrder(
      ids.extract(completedOrder.id),
      ids.extract(completedOrder.order.id),
      enterprise
    );
    return completedOrder;
  }
  return shopifyDraftOrder;
}

export default withLdpErrors(updateOrder);
