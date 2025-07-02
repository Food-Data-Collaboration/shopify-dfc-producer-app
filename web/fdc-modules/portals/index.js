import { Router } from 'express';

import { getPortals, getPortal, updatePortal } from './portal-operations.js';

const portals = Router({ mergeParams: true });

portals.get('/', getPortals);
portals.put('/:PortalId', updatePortal);
portals.get('/:PortalId', getPortal);

export default portals;
