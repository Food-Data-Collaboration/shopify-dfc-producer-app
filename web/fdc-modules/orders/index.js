import { Router } from 'express';
import { ldpOptions, withLdpErrors } from '../ldp/index.js';

import create from './controllers/create-order.js';
import update from './controllers/update-order.js';
import get from './controllers/get-order.js';
import getAllOrders from './controllers/get-all-orders.js';
import getOrderLines from './controllers/get-order-lines.js';
import createOrUpdateOrderLine from './controllers/create-or-update-order-line.js';
import getOrderLine from './controllers/get-order-line.js';

/**
 * `Orders` is an LDP container. DjangoLDP has no Order model, so there is
 * nothing to mirror structurally — but hubs traverse this path as a container
 * and the protocol headers (`Link`, `Accept-Post`, `Accept-Patch`, `ETag`,
 * `Location`) are now set, with the existing controller logic unchanged
 * underneath. See `web/fdc-modules/orders/ldp.js` for why the response bodies
 * stay bare DFC graphs.
 */
const fdcOrderRoutes = Router({ mergeParams: true });

fdcOrderRoutes.options('/', ldpOptions({ container: true, writable: true }));
fdcOrderRoutes.get('/', getAllOrders);
fdcOrderRoutes.post('/', create);

fdcOrderRoutes.options('/:id', ldpOptions({ container: false, writable: true }));
fdcOrderRoutes.get('/:id', get);
fdcOrderRoutes.put('/:id', update);

fdcOrderRoutes.options('/:id/orderLines', ldpOptions({ container: true, writable: false }));
fdcOrderRoutes.get('/:id/orderLines', getOrderLines);
fdcOrderRoutes.post('/:id/orderLines', createOrUpdateOrderLine);
fdcOrderRoutes.get('/:id/orderLines/:lineId', getOrderLine);
fdcOrderRoutes.put('/:id/orderLines/:lineId', createOrUpdateOrderLine);

export { withLdpErrors };
export default fdcOrderRoutes;
