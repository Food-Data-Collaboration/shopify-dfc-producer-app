import config from '../../config.js';
import { getPermissions, updatePermissions } from '../../database/portals/portals.js';

const dfcPlatform = ({
  id, description, terms_and_conditions, title, scopes
}, addContext) => ({
  ...(addContext ? { '@context': 'https://cdn.startinblox.com/owl/context-bis.jsonld' } : {}),
  '@id': id,
  '@type': 'dfc-t:Platform',
  localId: 'xxxxxxxxxxxxxxxxx',
  title,
  description,
  termsandconditions: terms_and_conditions,
  'dfc-t:hasAssignedScopes': {
    '@list': scopes.map((scope) => ({
      '@id': `https://data-server.cqcm.startinblox.com/enterprises/1/platforms/scopes/${scope}`,
      '@type': 'dfc-t:Scope',
      'dfc-t:scope': scope
    })),
    '@type': 'rdf:List'
  }
});

export const getPortal = async (req, res) => {
  const { PortalId } = req.params;

  const permissions = (await getPermissions(req.shop.id))
    .find((portalPermissions) => portalPermissions.id === PortalId);

  if (permissions) {
    res.send(dfcPlatform(permissions, true));
  } else {
    res.status(404).send('Platform not found');
  }
};

export const getPortals = async (req, res) => {
  const { EnterpriseName } = req.params;

  const permissions = await getPermissions(req.shop.id);

  const graph = permissions.map(dfcPlatform);

  res.send({
    '@context': 'https://cdn.startinblox.com/owl/context-bis.jsonld',
    '@id': `${config.HOST.replace(/\/+$/, '')}/api/dfc/Enterprises/${EnterpriseName}/Portals`,
    'dfc-t:platforms': {
      '@list': graph,
      '@type': 'rdf:List'
    }
  });
};

export const updatePortal = async (req, res) => {
  const updatedScopes = (req.body['dfc-t:hasAssignedScopes']?.['@list'] || []).map((data) => (data['dfc-t:scope']));
  await updatePermissions(req.shop.id, req.params.PortalId, updatedScopes);

  const permissions = (await getPermissions(req.shop.id))
    .find((portalPermissions) => portalPermissions.id === req.params.PortalId);

  res.send({});
  res.send(dfcPlatform(permissions, true));
};
