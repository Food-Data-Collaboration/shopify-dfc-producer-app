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
import { orderMemberUri, sendOrderWrite } from '../ldp.js';
import { sendProblem, sendWriteResult, withLdpErrors } from '../../ldp/index.js';

const createOrder = async (req, res) => {
  const session = await getSession(
    `${req.params.EnterpriseName}.myshopify.com`
  );
  const client = new shopify.api.clients.Graphql({ session });

  const customerId = await findCustomer(client, req.user.id);

  if (!customerId) {
    console.error(`Cannot place order. No customer set up in Shopify matching ordering client email address - ${req.user.id}`);
    return sendProblem(req, res, 403, {
      title: 'Forbidden',
      detail: `Customer with email matching ${req.user.id} must exist in shopify for you to create an order`
    });
  }

  const { order, saleSession } = await extractOrderAndLinesAndSalesSession(
    req.body
  );

  const orderLines = Array.isArray(order.hasPart)
    ? order.hasPart
    : [order.hasPart].filter(Boolean);
  const shopifyLines = await Promise.all(
    orderLines.map(orders.dfcLineToShopifyLine)
  );

  const shopifyDraftOrder = await orders.createShopifyOrder(
    client,
    customerId,
    req.user.email,
    new Date(saleSession.endDate),
    shopifyLines
  );

  const draftOrderId = ids.extract(shopifyDraftOrder.id);

  await createDraftOrder(draftOrderId, req.user.id, req.params.EnterpriseName);
  await createSalesSession(
    draftOrderId,
    saleSession.endDate,
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

  // Deliberately 200, not the 201 LDP specifies: live hubs (and our own
  // acceptance-tests/order.spec.js) assert 200 on POST /Orders. We keep the
  // status and add the `Location` header LDP clients actually need to
  // dereference what they just created. `Prefer: return=minimal` still
  // collapses to 204 + Location.
  return sendWriteResult(req, res, {
    status: 200,
    body: dfcOrder,
    member: true,
    location: orderMemberUri(req.params.EnterpriseName, draftOrderId)
  });
};

export default withLdpErrors(createOrder);
