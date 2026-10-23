import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import { createDfcOrderLineFromShopify } from '../dfc/dfc-order.js';
import { findOrder } from './shopify/orders.js';
import { getLineItems } from '../../../database/line_items/lineItems.js';
import { getOrder } from '../../../database/orders/orders.js';
import { orderForbidden, orderNotFound, sendOrderMember } from '../ldp.js';
import { withLdpErrors } from '../../ldp/index.js';

const getOrderLine = async (req, res) => {
  const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
  const client = new shopify.api.clients.Graphql({ session });

  const order = await getOrder(req.params.id, req.user.id, req.params.EnterpriseName);

  if (!order) {
    return orderForbidden(req, res);
  }

  const { order: shopifyOrder } = await findOrder(client, req.params.id, {});

  if (!shopifyOrder) {
    return orderNotFound(req, res);
  }

  const line = await createDfcOrderLineFromShopify(
    shopifyOrder,
    req.params.lineId,
    await getLineItems(req.params.id, req.params.EnterpriseName),
    req.params.EnterpriseName,
    req.params.id
  );

  if (!line) {
    return orderNotFound(req, res, 'Order line not found');
  }

  return sendOrderMember(req, res, line);
};

export default withLdpErrors(getOrderLine);
