import { getAllLineItems } from '../../../database/line_items/lineItems.js';
import shopify from '../../../shopify.js';
import { findCustomer } from './shopify/customer.js';
import getSession from '../../../utils/getShopifySession.js';
import { createBulkDfcOrderFromShopify } from '../dfc/dfc-order.js';
import { findOrders } from './shopify/orders.js';

function respond(res, graph, pageInfo) {
  res.type('application/json');
  if (pageInfo) {
    res.set('pageInfo', JSON.stringify(pageInfo));
  }
  res.send(graph);
}

const getAllOrders = async (req, res) => {
  try {
    const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
    const client = new shopify.api.clients.Graphql({ session });

    const customerId = await findCustomer(client, req.user.id);

    if (!customerId) {
      return respond(
        res,
        await createBulkDfcOrderFromShopify([], [], req.params.EnterpriseName),
        null
      );
    }

    const {
      before, after, first, last
    } = req.query;

    if ((before && after) || (before && first) || (after && last) && (before && !last) && (after && !first)) {
      return res.status(400).send('Incorrect combination of paging parameters. You cannot page forward and backwards symultaneously');
    }

    const draftOrdersWithLineItemMappings = await getAllLineItems(req.params.EnterpriseName);

    const { orders, pageInfo } = await findOrders(client, customerId, {
      before, after, first: Number(first), last: Number(last)
    });

    const allDfcOrders = await createBulkDfcOrderFromShopify(
      orders,
      draftOrdersWithLineItemMappings,
      req.params.EnterpriseName
    );

    return respond(res, allDfcOrders, pageInfo);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

export default getAllOrders;
