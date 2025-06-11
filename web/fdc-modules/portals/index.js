import { Router } from 'express';

import { getPortals, getPortal } from './get-portals.js';
import updatePortal from './update-portal.js';

const portals = Router({ mergeParams: true });

portals.get('/', getPortals);
portals.put('/:PortalId', updatePortal);
portals.get('/:PortalId', getPortal);

export default portals;
