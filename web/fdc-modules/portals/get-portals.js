import config from '../../config.js';
import { getPermissions } from '../../database/portals/portals.js';

const dfcPlatform = ({
  id, description, terms_and_conditions, title, scopes
}) => ({
  '@id': id,
  '@type': 'dfc-t:Platform',
  _id: {
    $oid: encodeURIComponent(id)
  },
  description,
  'dfc-t:hasAssignedScopes': {
    '@list': [
      scopes.map((scope) => ({
        '@id': `https://data-server.cqcm.startinblox.com/enterprises/1/platforms/scopes/${scope}`,
        '@type': 'dfc-t:Scope',
        'dfc-t:scope': scope
      }))],
    '@type': 'rdf:List'
  },
  termsandconditions: terms_and_conditions,
  title
});

export const getPortal = async (req, res) => {
  const { PortalId } = req.params;

  const permissions = (await getPermissions(req.shop.id))
    .find((portalPermissions) => portalPermissions.id === PortalId);

  if (permissions) {
    res.send(dfcPlatform(permissions));
  } else {
    res.status(404).send('Platform not found');
  }
};

export const getPortals = async (req, res) => {
  const { EnterpriseName } = req.params;

  const permissions = await getPermissions(req.shop.id);

  const graph = permissions.map(({
    id, description, terms_and_conditions, title, scopes
  }) => ({
    '@id': id,
    '@type': 'dfc-t:Platform',
    _id: {
      $oid: encodeURIComponent(id)
    },
    description,
    'dfc-t:hasAssignedScopes': {
      '@list': [
        scopes.map((scope) => ({
          '@id': `https://data-server.cqcm.startinblox.com/enterprises/1/platforms/scopes/${scope}`,
          '@type': 'dfc-t:Scope',
          'dfc-t:scope': scope
        }))],
      '@type': 'rdf:List'
    },
    termsandconditions: terms_and_conditions,
    title
  }));

  res.send({
    '@context': 'https://cdn.startinblox.com/owl/context-bis.jsonld',
    '@id': `${
      config.HOST
    }api/dfc/Enterprises/${EnterpriseName}/Portals`,
    'dfc-t:platforms': {
      '@list': graph,
      '@type': 'rdf:List'
    }
  });
};
