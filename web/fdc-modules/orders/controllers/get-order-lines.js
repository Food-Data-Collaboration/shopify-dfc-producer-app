import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import { createDfcOrderLinesFromShopify } from '../dfc/dfc-order.js';
import { findOrder } from './shopify/orders.js';
import { getLineItems } from '../../../database/line_items/lineItems.js';
import { getOrder } from '../../../database/orders/orders.js';

const getOrderLines = async (req, res) => {
  try {
    const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
    const client = new shopify.api.clients.Graphql({ session });

    const order = await getOrder(req.params.id, req.user.id, req.params.EnterpriseName);

    if (!order) {
      return res.status(403).send('You do not have permission to act on this order');
    }

    const {
      before, after, first, last
    } = req.query;

    if ((before && after) || (before && first) || (after && last) && (before && !last) && (after && !first)) {
      return res.status(400).send('Incorrect combination of paging parameters. You cannot page forward and backwards symultaneously');
    }

    const { order: shopifyOrder, pageInfo } = await findOrder(client, req.params.id, {
      before, after, first: Number(first), last: Number(last)
    });

    if (!shopifyOrder) {
      return res.status(404).send('Unable to find order');
    }

    const dfcOrder = await createDfcOrderLinesFromShopify(
      shopifyOrder,
      await getLineItems(req.params.id, req.params.EnterpriseName),
      req.params.EnterpriseName,
      req.params.id
    );
    res.type('application/json');
    res.set('pageInfo', JSON.stringify(pageInfo));
    res.send(dfcOrder);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

export default getOrderLines;
