import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import {
  extractOrderAndLinesAndSalesSession,
  createDfcOrderFromShopify
} from '../dfc/dfc-order.js';
import { findCustomer } from './shopify/customer.js';
import * as orders from './shopify/orders.js';
import * as ids from './shopify/ids.js';
import { persistLineIdMappings } from './lineItemMappings.js';
import { createDraftOrder } from '../../../database/orders/orders.js';
import { createSalesSession } from '../../../database/sales_sessions/salesSessions.js';

const createOrder = async (req, res) => {
  try {
    console.log('Creating order with', req.body);
    const session = await getSession(
      `${req.params.EnterpriseName}.myshopify.com`
    );
    const client = new shopify.api.clients.Graphql({ session });

    const customerId = await findCustomer(client, req.user.id);

    if (!customerId) {
      console.error(`Cannot place order. No customer set up in Shopify matching ordering client email address - ${req.user.id}`);
      return res.status(403).send(`Customer with email matching ${req.user.id} must exist in shopify for you to create an order`);
    }

    const { order, saleSession } = await extractOrderAndLinesAndSalesSession(
      req.body
    );

    const shopifyLines = await Promise.all(
      (await order.getLines()).map(orders.dfcLineToShopifyLine)
    );

    const shopifyDraftOrder = await orders.createShopifyOrder(
      client,
      customerId,
      req.user.email,
      new Date(saleSession.getEndDate()),
      shopifyLines
    );

    await createDraftOrder(
      ids.extract(shopifyDraftOrder.id),
      req.user.id,
      req.params.EnterpriseName
    );
    await createSalesSession(
      ids.extract(shopifyDraftOrder.id),
      saleSession.getEndDate(),
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

export default createOrder;
