import { getAllLineItems } from '../../../database/line_items/lineItems.js';
import shopify from '../../../shopify.js';
import { findCustomer } from './shopify/customer.js';
import getSession from '../../../utils/getShopifySession.js';
import { createBulkDfcOrderFromShopify } from '../dfc/dfc-order.js';
import { findOrders } from './shopify/orders.js';
import { sendOrdersContainer } from '../ldp.js';
import { sendProblem, withLdpErrors } from '../../ldp/index.js';

const getAllOrders = async (req, res) => {
  try {
    const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
    const client = new shopify.api.clients.Graphql({ session });

    const customerId = await findCustomer(client, req.user.id);

    if (!customerId) {
      return sendOrdersContainer(
        req,
        res,
        await createBulkDfcOrderFromShopify([], [], req.params.EnterpriseName)
      );
    }

    const {
      before, after, first, last
    } = req.query;

    if ((before && after) || (before && first) || (after && last) && (before && !last) && (after && !first)) {
      return sendProblem(req, res, 400, {
        title: 'Bad request',
        detail: 'Incorrect combination of paging parameters. You cannot page forward and backwards simultaneously'
      });
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

    return sendOrdersContainer(req, res, allDfcOrders, { pageInfo });
  } catch (error) {
    // Rethrow so the withLdpErrors wrapper below renders the problem
    // document. Recursing into the handler here would retry the same failing
    // Shopify/DB call indefinitely while the request stayed open.
    throw error;
  }
};

export default withLdpErrors(getAllOrders);
