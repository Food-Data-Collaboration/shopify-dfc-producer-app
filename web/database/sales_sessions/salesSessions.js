import { query } from '../connect.js';

export async function createSalesSession(orderId, reservationDate, enterprise) {
  const result = await query(
    `
      INSERT INTO sales_sessions (shopify_order_id, reservation_date) VALUES ($1, $2)
        RETURNING shopify_order_id, reservation_date;
    `,
    [orderId, reservationDate],
    null,
    enterprise
  );
  return result.rows;
}

export async function loadSalesSession(orderId, enterprise) {
  const result = await query(
    `
      SELECT shopify_order_id as "shopifyOrderId", reservation_date as "reservationDate" FROM sales_sessions where shopify_order_id = $1;`,
    [orderId],
    null,
    enterprise
  );
  return result.rows[0];
}
