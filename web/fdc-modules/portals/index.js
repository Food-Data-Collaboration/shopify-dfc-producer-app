import { Router } from 'express';
import shopify from '../../shopify.js';
import { getPortals, getPortal, updatePortal } from './portal-operations.js';

const portals = Router({ mergeParams: true });

portals.get('/', shopify.validateAuthenticatedSession(), getPortals);
portals.put('/:PortalId', shopify.validateAuthenticatedSession(), updatePortal);
portals.get('/:PortalId', shopify.validateAuthenticatedSession(), getPortal);

export default portals;
