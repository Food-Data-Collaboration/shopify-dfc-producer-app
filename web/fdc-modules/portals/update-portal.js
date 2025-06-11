import { updatePermissions } from '../../database/portals/portals.js';

const updatePortalScopes = async (req, res) => {
  const updatedScopes = (req.body['dfc-t:hasAssignedScopes']?.['@list'] || []).map((data) => (data['dfc-t:scope']));
  await updatePermissions(req.shop.id, req.params.PortalId, updatedScopes);
  res.send({});
};

export default updatePortalScopes;
