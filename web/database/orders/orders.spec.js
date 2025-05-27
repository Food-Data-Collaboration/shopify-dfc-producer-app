import { pool } from '../connect';
import { createDraftOrder, completeDraftOrder, getOrder } from './orders';

describe('orders', () => {
  const openIdUserId = '08fcc438-1eb5-4c63-a8f4-894a3960351d';

  const getOrders = async () => {
    const result = await pool.query('SELECT draft_order_id as "draftOrderId", completed_order_id as "completedOrderId", owner_id as "ownerId" from orders order by draft_order_id', []);
    return result.rows;
  };

  beforeAll(async () => {
    await pool.query('truncate table orders restart identity');
  });

  it('Order can be created', async () => {
    await createDraftOrder(55, openIdUserId);
    await createDraftOrder(56, openIdUserId);
    const result = await getOrders();
    expect(result).toStrictEqual([{ draftOrderId: '55', completedOrderId: null, ownerId: 10 }, { draftOrderId: '56', completedOrderId: null, ownerId: 10 }]);
  });

  it('Order can be retrieved', async () => {
    expect(await getOrder(55, openIdUserId)).toStrictEqual({ draftOrderId: '55', completedOrderId: null, ownerId: 10 });
    expect(await getOrder(55, 12345)).toStrictEqual(null);
    expect(await getOrder(99, openIdUserId)).toStrictEqual(null);
  });

  it('Order can be completed', async () => {
    await completeDraftOrder(55, 654);
    const result = await getOrders();
    expect(result).toStrictEqual([{ draftOrderId: '55', completedOrderId: '654', ownerId: 10 }, { draftOrderId: '56', completedOrderId: null, ownerId: 10 }]);
  });
});
