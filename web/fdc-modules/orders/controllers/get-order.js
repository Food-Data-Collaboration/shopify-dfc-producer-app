import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import { createDfcOrderFromShopify } from '../dfc/dfc-order.js';
import { findOrder } from './shopify/orders.js';
import { getLineItems } from '../../../database/line_items/lineItems.js';
import { getOrder as getOrderMetadata } from '../../../database/orders/orders.js';
import { orderForbidden, orderNotFound, sendOrderMember } from '../ldp.js';
import { withLdpErrors } from '../../ldp/index.js';

const getOrder = async (req, res) => {
  const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
  const client = new shopify.api.clients.Graphql({ session });

  const order = await getOrderMetadata(req.params.id, req.user.id, req.params.EnterpriseName);

  if (!order) {
    return orderForbidden(req, res);
  }

  const { order: shopifyOrder } = await findOrder(client, req.params.id, {});

  if (!shopifyOrder) {
    return orderNotFound(req, res);
  }

  const dfcOrder = await createDfcOrderFromShopify(
    shopifyOrder,
    await getLineItems(req.params.id, req.params.EnterpriseName),
    req.params.EnterpriseName
  );

  return sendOrderMember(req, res, dfcOrder);
};

export default withLdpErrors(getOrder);
