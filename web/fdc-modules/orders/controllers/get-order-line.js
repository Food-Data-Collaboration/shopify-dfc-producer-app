import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import { createDfcOrderLineFromShopify } from '../dfc/dfc-order.js';
import { findOrder } from './shopify/orders.js';
import { getLineItems } from '../../../database/line_items/lineItems.js';
import { getOrder } from '../../../database/orders/orders.js';

const getOrderLine = async (req, res) => {
  try {
    const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
    const client = new shopify.api.clients.Graphql({ session });

    const order = await getOrder(req.params.id, req.user.id, req.params.EnterpriseName);

    if (!order) {
      return res.status(403).send('You do not have permission to act on this order');
    }

    const { order: shopifyOrder } = await findOrder(client, req.params.id, {});

    if (!shopifyOrder) {
      return res.status(404).send('Unable to find order');
    }

    const line = await createDfcOrderLineFromShopify(
      shopifyOrder,
      req.params.lineId,
      await getLineItems(req.params.id, req.params.EnterpriseName),
      req.params.EnterpriseName,
      req.params.id
    );

    if (!line) {
      res.status(404).send('Order line not found');
    }
    res.type('application/json');
    res.send(line);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

export default getOrderLine;
