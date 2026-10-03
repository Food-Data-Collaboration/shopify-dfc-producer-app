import { Router } from 'express';
import { ldpOptions } from '../ldp/index.js';
import {
  getProducts,
  getProduct,
  publishSuppliedProduct,
  replaceSuppliedProduct,
  patchSuppliedProduct,
  unpublishSuppliedProduct,
  withLdpErrors
} from './ldp.js';

/**
 * `SuppliedProducts` is an LDP container: POST creates a member, and
 * `/{ProductId}` is a member supporting GET/PUT/PATCH/DELETE. Scope
 * enforcement (ReadProducts / WriteProducts) lives in
 * `web/middleware/checkScopePermissions.js`, driven by
 * `web/fdc-modules/scopes/matrix.js`.
 */
const fdcProductRoutes = Router({ mergeParams: true });

// `cors()` on the mount answers OPTIONS itself and does not call next() unless
// `preflightContinue` is set (app.js does that), so ldpOptions still runs and
// the client gets Allow/Link/Accept-Post alongside the CORS headers.
fdcProductRoutes.options('/', ldpOptions({ container: true, writable: true }));
fdcProductRoutes.get('/', withLdpErrors(getProducts));
fdcProductRoutes.post('/', withLdpErrors(publishSuppliedProduct));

fdcProductRoutes.options('/:ProductId', ldpOptions({ container: false, writable: true }));
fdcProductRoutes.get('/:ProductId', withLdpErrors(getProduct));
fdcProductRoutes.put('/:ProductId', withLdpErrors(replaceSuppliedProduct));
fdcProductRoutes.patch('/:ProductId', withLdpErrors(patchSuppliedProduct));
fdcProductRoutes.delete('/:ProductId', withLdpErrors(unpublishSuppliedProduct));

export default fdcProductRoutes;
