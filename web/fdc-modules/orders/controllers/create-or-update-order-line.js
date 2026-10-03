import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import { extractOrderLine, createDfcOrderLineFromShopify } from '../dfc/dfc-order.js';
import { persistLineIdMappings } from './lineItemMappings.js';
import * as orders from './shopify/orders.js';
import * as ids from './shopify/ids.js';
import { suppliedProductIdFor } from './shopify/orders.js';
import { getOrder } from '../../../database/orders/orders.js';
import { orderForbidden, orderNotFound, sendOrderWrite } from '../ldp.js';
import { withLdpErrors } from '../../ldp/index.js';

const createOrUpdateOrderLine = async (req, res) => {
  const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
  const client = new shopify.api.clients.Graphql({ session });

  const order = await getOrder(req.params.id, req.user.id, req.params.EnterpriseName);

  if (!order) {
    return orderForbidden(req, res);
  }

  const orderLine = await extractOrderLine(req.body);

  const { order: shopifyOrder } = await orders.findOrder(client, req.params.id, {});

  if (!shopifyOrder) {
    return orderNotFound(req, res);
  }

  const updatedLines = await orders.createUpdatedShopifyLines(shopifyOrder, orderLine);
  const updatedShopifyDraftOrder = await orders.updateOrder(client, req.params.id, null, updatedLines);
  const lineItemIdMappings = await persistLineIdMappings(updatedShopifyDraftOrder, req.params.EnterpriseName);

  const externalLineId = req.params.lineId || figureOutExternalLineIdForProduct(lineItemIdMappings, await getProductId(orderLine));

  const dfcOrder = await createDfcOrderLineFromShopify(updatedShopifyDraftOrder, externalLineId, lineItemIdMappings, req.params.EnterpriseName, req.params.id);

  return sendOrderWrite(req, res, dfcOrder);
};

async function getProductId(dfcLine) {
  // Offer -> CatalogItem -> SuppliedProduct in v2; see
  // `suppliedProductIdFor` in shopify/orders.js for why the chain matters.
  const semanticId = suppliedProductIdFor(dfcLine);
  return ids.extract(semanticId || dfcLine.semanticId);
}

function figureOutExternalLineIdForProduct(lineItemIdMappings, productId) {
  return lineItemIdMappings.find(({ variantId }) => variantId === productId).externalId;
}

export default withLdpErrors(createOrUpdateOrderLine);
