import { Router } from 'express';

import { getPortals, getPortal } from './get-portals.js';
import update from './update-portal.js';

const portals = Router({ mergeParams: true });

portals.get('/', getPortals);
portals.put('/:PortalId', update);
portals.get('/:PortalId', getPortal);

export default portals;
