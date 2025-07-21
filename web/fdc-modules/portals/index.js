import { Router } from 'express';
import shopify from '../../shopify.js';
import { getPortals, getPortal, updatePortal } from './portal-operations.js';

const portals = Router({ mergeParams: true });

portals.get('/', getPortals);
portals.put('/:PortalId', shopify.validateAuthenticatedSession(), updatePortal);
portals.get('/:PortalId', getPortal);

export default portals;
