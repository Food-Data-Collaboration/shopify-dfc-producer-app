import { Issuer } from 'openid-client';
import config from '../config.js';

let cachedScopes = null;
let cacheTimestamp = 0;

async function getScopes(cacheTtlMs = 10 * 60 * 1000) {
  const now = Date.now();

  if (cachedScopes && (now - cacheTimestamp < cacheTtlMs)) {
    return cachedScopes;
  }

  const issuer = await Issuer.discover(`${config.OIDC_ISSUER}/.well-known/openid-configuration`);

  const allScopes = issuer.metadata.scopes_supported || [];

  const filteredScopes = allScopes.filter((scope) => /^Read|^Write/.test(scope));

  cachedScopes = filteredScopes;
  cacheTimestamp = now;
  return filteredScopes;
}

const scopes = async (req, res) => {
  const currentScopes = await getScopes();
  res.send({
    '@context': 'https://cdn.startinblox.com/owl/context-bis.jsonld',
    '@id': `${
      config.HOST
    }/api/scopes`,
    'dfc-t:scopes': {
      '@list': currentScopes.map((scope) => ({
        '@id': 'https://example.com/scopes/ReadEnterprise',
        'dfc-t:hasDescription': `The ${scope} scope`,
        'dfc-t:name': scope,
        'dfc-t:scope': scope
      })),
      '@type': 'rdf:List'
    }
  });
};

export default scopes;
