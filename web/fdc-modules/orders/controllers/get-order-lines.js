import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import { createDfcOrderLinesFromShopify } from '../dfc/dfc-order.js';
import { findOrder } from './shopify/orders.js';
import { getLineItems } from '../../../database/line_items/lineItems.js';
import { getOrder } from '../../../database/orders/orders.js';
import { orderForbidden, orderNotFound, sendOrderMember } from '../ldp.js';
import { sendProblem, withLdpErrors } from '../../ldp/index.js';

const getOrderLines = async (req, res) => {
  const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
  const client = new shopify.api.clients.Graphql({ session });

  const order = await getOrder(req.params.id, req.user.id, req.params.EnterpriseName);

  if (!order) {
    return orderForbidden(req, res);
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

  const { order: shopifyOrder, pageInfo } = await findOrder(client, req.params.id, {
    before, after, first: Number(first), last: Number(last)
  });

  if (!shopifyOrder) {
    return orderNotFound(req, res);
  }

  const dfcOrder = await createDfcOrderLinesFromShopify(
    shopifyOrder,
    await getLineItems(req.params.id, req.params.EnterpriseName),
    req.params.EnterpriseName,
    req.params.id
  );

  res.set('pageInfo', JSON.stringify(pageInfo));

  return sendOrderMember(req, res, dfcOrder);
};

export default withLdpErrors(getOrderLines);
