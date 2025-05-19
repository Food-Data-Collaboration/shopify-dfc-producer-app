import loadConnectorWithResources from '../../../connector/index.js';
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

const updateOrder = async (req, res) => {
  try {
    console.log('updating order with body:>> ', req.body);
    console.log('updating order with params :>> ', req.params);

    const orderMetadata = await database.getOrder(
      req.params.id,
      req.user.id,
      req.params.EnterpriseName
    );

    if (!orderMetadata) {
      return res
        .status(403)
        .send('You do not have permission to act on this order');
    }

    const session = await getSession(
      `${req.params.EnterpriseName}.myshopify.com`
    );
    const client = new shopify.api.clients.Graphql({ session });

    const order = await extractOrderAndLines(req.body);

    if (ids.extract(await order.getSemanticId()) !== req.params.id) {
      return res.status(400).send('ID does not match payload');
    }

    const { order: shopifyOrder } = await shopifyOrders.findOrder(
      client,
      req.params.id,
      {}
    );

    if (!shopifyOrder) {
      return res.status(404).send('Unable to find order');
    }

    const salesSession = await loadSalesSession(req.params.id, req.params.EnterpriseName);

    if (!salesSession) {
      return res.status(500).send('Unable to find sales session');
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
    res.type('application/json');
    res.send(dfcOrder);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

async function updateShopifyDraftOrder(client, order, reservationDate, enterprise) {
  const dfcLines = await order.getLines();

  const shopifyLines = (
    await Promise.all(dfcLines.map(shopifyOrders.dfcLineToShopifyLine))
  ).filter(({ quantity }) => quantity > 0);
  const shopifyDraftOrder = await shopifyOrders.updateOrder(
    client,
    ids.extract(await order.getSemanticId()),
    reservationDate,
    shopifyLines
  );
  const connector = await loadConnectorWithResources();
  if (
    (await order.getOrderStatus()) ===
    connector.VOCABULARY.STATES.ORDERSTATE.COMPLETE
  ) {
    const completedOrder = await shopifyOrders.completeDraftOrder(
      client,
      ids.extract(await order.getSemanticId())
    );
    await database.completeDraftOrder(
      ids.extract(completedOrder.id),
      ids.extract(completedOrder.order.id),
      enterprise
    );
    return completedOrder;
  }
  return shopifyDraftOrder;
}

export default updateOrder;
