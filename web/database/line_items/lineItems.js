import { query } from '../connect.js';

export const createOrUpdateLineItems = async (orderId, lineItems, enterprise) => {
  const parameters = lineItems.map((line) => ({ orderId, id: line.id, variantId: line.variantId }));
  const result = await query(
    `
            INSERT INTO line_items (shopify_id, order_id, variant_id)
            (SELECT *
            FROM json_to_recordset($1)
            AS x("id" bigint, "orderId" bigint, "variantId" bigint))
            on CONFLICT(order_id, variant_id)
            DO UPDATE SET
               shopify_id = EXCLUDED.shopify_id 
            RETURNING *;
        `,

    [JSON.stringify(parameters)],
    null,
    enterprise
  );
  return result.rows;
};

export const getLineItems = async (orderId, enterprise) => (await query('SELECT external_id as "externalId", shopify_id as "shopifyId", variant_id as "variantId" FROM line_items where order_id = $1', [orderId], null, enterprise)).rows;

export const getAllLineItems = async (enterprise) => {
  const lineItems = (await query('SELECT order_id as "draftOrderId", external_id as "externalId", shopify_id as "shopifyId", variant_id as "variantId" FROM line_items order by order_id', [], null, enterprise)).rows;
  return lineItems.reduce((accumulator, lineItem) => {
    const [lastOrder, ...others] = accumulator;
    if (lastOrder?.draftOrderId === lineItem.draftOrderId) {
      return [{
        draftOrderId: lineItem.draftOrderId,
        lineItems: [lineItem, ...lastOrder.lineItems]
      }, ...others];
    }
    return [{ draftOrderId: lineItem.draftOrderId, lineItems: [lineItem] }, ...accumulator];
  }, []).reverse();
};
