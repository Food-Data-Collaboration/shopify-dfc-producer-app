jest.mock('../../../shopify.js', () => ({
  __esModule: true,
  default: { api: { clients: { Graphql: jest.fn() } } }
}));
jest.mock('../../../utils/getShopifySession.js', () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));
jest.mock('./shopify/orders.js', () => ({
  __esModule: true,
  dfcLineToShopifyLine: jest.fn(async (line) => ({ quantity: line.quantity || 1 })),
  updateOrder: jest.fn(async () => ({ id: 'gid://shopify/DraftOrder/123', order: { id: 456 } })),
  completeDraftOrder: jest.fn(async () => ({ id: 'gid://shopify/Order/789', order: { id: 456 } }))
}));
jest.mock('../../../database/orders/orders.js', () => ({
  __esModule: true,
  completeDraftOrder: jest.fn()
}));

import { updateShopifyDraftOrder } from './update-order.js';
import * as database from '../../../database/orders/orders.js';
import * as shopifyOrders from './shopify/orders.js';

const client = {};
const reservationDate = new Date('2026-01-01');
const enterprise = 'acme';

const orderWithStatus = (hasOrderStatus) => ({
  semanticId: 'http://localhost:3629/api/dfc/Enterprises/acme/Orders/123',
  hasOrderStatus,
  hasPart: [{ quantity: 2 }]
});

describe('updateShopifyDraftOrder status completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completes the draft when hasOrderStatus is an unresolved object reference', async () => {
    const order = orderWithStatus({ '@id': 'dfc-v:Complete' });

    await updateShopifyDraftOrder(client, order, reservationDate, enterprise);

    expect(shopifyOrders.completeDraftOrder).toHaveBeenCalledTimes(1);
    expect(database.completeDraftOrder).toHaveBeenCalledTimes(1);
  });

  it('completes when hasOrderStatus is a bare IRI string', async () => {
    const order = orderWithStatus('dfc-v:Complete');

    await updateShopifyDraftOrder(client, order, reservationDate, enterprise);

    expect(shopifyOrders.completeDraftOrder).toHaveBeenCalledTimes(1);
  });

  it('does not complete when hasOrderStatus is another status', async () => {
    const order = orderWithStatus('dfc-v:Unfulfilled');

    await updateShopifyDraftOrder(client, order, reservationDate, enterprise);

    expect(shopifyOrders.completeDraftOrder).not.toHaveBeenCalled();
    expect(database.completeDraftOrder).not.toHaveBeenCalled();
  });
});
