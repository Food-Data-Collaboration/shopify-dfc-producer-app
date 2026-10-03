/**
 * WebID profile — the DFC dataserver's self-description.
 *
 * Mirrors DjangoLDP's `InstanceWebIDView`: a `@graph` with a
 * `foaf:PersonalProfileDocument` pointing at the application node, which
 * advertises the DFC containers it serves and the OIDC issuer that governs
 * them. This is the document a hub reads first to discover where products and
 * orders live and which scopes it must ask for, so it needs to work
 * unauthenticated.
 *
 * `/api/scopes` remains the machine-readable scope list (dynamically
 * discovered from the OIDC issuer); this document points at it rather than
 * duplicating the query, and adds the static write scopes the app enforces.
 */
import config from '../config.js';
import { ADVERTISED_SCOPES } from './scopes/matrix.js';
import { host, sendLdp } from './ldp/index.js';

const profileUri = () => `${host()}/profile`;
const meUri = () => `${profileUri()}#me`;

const PROFILE_CONTEXT = [
  'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json',
  {
    foaf: 'http://xmlns.com/foaf/0.1/',
    solid: 'http://www.w3.org/ns/solid/terms#',
    sib: 'https://sibboleth.net/ns',
    dcterms: 'http://purl.org/dc/terms/',
    // DFC's terminology namespace. Quoted because the key contains a dash.
    'dfc-t': 'http://static.datafoodconsortium.org/ontologies/DFC_Terminology.owl#',
    ldp: 'http://www.w3.org/ns/ldp#',
    sec: 'https://w3id.org/security#'
  }
];

const title = () => 'DFC Dataserver (Shopify)';

/**
 * The containers this app exposes. Absolute URIs, so a hub can build the
 * member paths by substitution without parsing HTML or guessing.
 */
const serviceEndpoints = () => [
  {
    '@type': 'ldp:Container',
    '@id': `${host()}/api/dfc/Enterprises`,
    'dcterms:title': 'Enterprises',
    'dcterms:description': 'Container of the DFC Enterprises this dataserver shares. Read only: '
      + 'an enterprise is provisioned by installing the app on a shop, not by an LDP write.'
  },
  {
    '@type': 'ldp:Container',
    '@id': `${host()}/api/dfc/Enterprises/{EnterpriseName}/SuppliedProducts`,
    'dcterms:title': 'SuppliedProducts',
    'dcterms:description': 'Container of published SuppliedProducts. Supports POST, which publishes '
      + 'an existing Shopify variant, and PUT/PATCH/DELETE on members. Requires WriteProducts.'
  },
  {
    '@type': 'ldp:Container',
    '@id': `${host()}/api/dfc/Enterprises/{EnterpriseName}/Orders`,
    'dcterms:title': 'Orders',
    'dcterms:description': 'Container of the calling user\'s draft orders. Supports POST and PUT on '
      + 'members, and on order-line members at {id}/orderLines/{lineId}. Requires WriteOrders.'
  },
  {
    '@type': 'ldp:Resource',
    '@id': `${host()}/api/scopes`,
    'dcterms:title': 'Scopes',
    'dcterms:description': 'Machine-readable list of the OIDC scopes the identity provider advertises.'
  }
];

/**
 * `GET /profile` — unauthenticated, like DjangoLDP's `/profile`, because the
 * document contains no per-user data: it describes the dataserver, not the
 * caller. Per-user authorisation still happens on every DFC route.
 */
const profile = (req, res) => sendLdp(req, res, 200, {
  '@context': PROFILE_CONTEXT,
  '@graph': [
    {
      '@id': profileUri(),
      '@type': 'foaf:PersonalProfileDocument',
      // Without an explicit `@type: @id` this serialises as an RDF literal
      // rather than a link, so a JSON-LD consumer cannot traverse from the
      // profile document to the WebID node.
      'foaf:primaryTopic': { '@id': meUri(), '@type': '@id' }
    },
    {
      '@id': meUri(),
      '@type': ['sib:HublApplication', 'solid:Application', 'foaf:Agent'],
      'dcterms:title': title(),
      'dcterms:description': 'A Data Food Consortium dataserver backed by a Shopify shop. '
        + 'Serves DFC v2 JSON-LD over the Linked Data Platform. Enterprises and published '
        + 'SuppliedProducts are readable; writes are authorised per-client by DFC scope and '
        + 'per-user by the shop owner.',
      'dcterms:license': `${host()}/terms`,
      // Auth model: a DFC scope (authorising the *client*) AND the shop
      // owner's approval of the OIDC user id (authorising the *user*).
      'sec:authentication': [{ '@id': config.OIDC_ISSUER || `${host()}/api/scopes` }],
      'dfc-t:scopes': ADVERTISED_SCOPES,
      'dcterms:hasPart': serviceEndpoints()
    }
  ]
});

export default profile;
