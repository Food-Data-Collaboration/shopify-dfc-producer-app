import { PhoneNumber } from '@siol-data/linkml-connector';
import shopify from '../../../shopify.js';
import getShopDetails from '../shopify/shop.js';
import getLogo from '../shopify/storefront.js';
import getSession from '../../../utils/getShopifySession.js';
import loadConnectorWithResources from '../../../connector/index.js';
import { getAllShopNames } from '../../../database/connect.js';
import {
  getVariants
} from '../../../database/variants/variants.js';
import {
  buildContainer,
  containerUri,
  graphToMembers,
  sendGraph,
  sendLdp,
  sendProblem
} from '../../ldp/index.js';

/**
 * Member URIs are absolute (`config.HOST`-rooted) so they dereference from any
 * host the hub happens to talk to. The enterprise builders below still use the
 * historical `/api/dfc/...` relative form for the blank-node members; the
 * published `@id`s that hubs dereference come from `productUtils` /
 * `dfc-order`, which are already HOST-rooted.
 */
const absoluteUri = (...segments) => containerUri(...segments);

const buildSingleEnterprise = async (enterpriseName, storeFrontAccessToken) => {
  const session = await getSession(`${enterpriseName}.myshopify.com`);
  const client = new shopify.api.clients.Graphql({ session });

  const {
    description, contactEmail, businessAddress, primaryDomain, name, shopOwnerName
  } = await getShopDetails(client);

  const connector = await loadConnectorWithResources();

  const [firstName, lastName] = shopOwnerName.split(' ');
  const mainContact = connector.createPerson(
    `/api/dfc/Enterprises/${enterpriseName}#mainContact`,
    { firstName, familyName: lastName }
  );

  const logo = await getLogo(enterpriseName, storeFrontAccessToken);

  const enterprise = connector.createEnterprise(
    `/api/dfc/Enterprises/${enterpriseName}`,
    { description, logo, hasMainContact: mainContact.semanticId }
  );

  const address = connector.createAddress(
    `/api/dfc/Enterprises/${enterpriseName}#mainAddress`,
    {
      street: businessAddress.address2,
      postcode: businessAddress.zip,
      city: businessAddress.city,
      country: businessAddress.country,
      region: businessAddress.region
    }
  );

  enterprise.hasAddress = address.semanticId;

  const phoneNumber = businessAddress.phone && new PhoneNumber(
    `/api/dfc/Enterprises/${enterpriseName}#phoneNumber`,
    { phoneNumber: businessAddress.phone }
  );

  if (phoneNumber) {
    enterprise.hasPhoneNumber = phoneNumber.semanticId;
  }

  enterprise.email = contactEmail;
  enterprise.websitePage = primaryDomain.url;
  enterprise.name = name;

  const variants = await getVariants(enterpriseName);

  const suppliedProducts = variants
    .filter((variant) => variant.enabled)
    .map((variant) => connector.createSuppliedProduct(
      `/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts/${variant.id}`
    ));

  enterprise.supplies = suppliedProducts.map((p) => p.semanticId);

  return [
    enterprise,
    address,
    mainContact,
    ...(phoneNumber ? [phoneNumber] : []),
    ...suppliedProducts
  ];
};

/**
 * `GET /api/dfc/Enterprises/{name}` — an LDP member (`ldp:Resource` /
 * `ldp:RDFSource`). The body is the connector graph: the Enterprise plus the
 * blank-node-ish address / mainContact / phoneNumber / supplies members it
 * references, which is exactly what a hub dereferences.
 */
export const getEnterprise = async (req, res) => {
  const connector = await loadConnectorWithResources();
  const graph = await connector.export(
    ...await buildSingleEnterprise(req.params.EnterpriseName, req.shop.storeFrontAccessToken)
  );

  return sendGraph(req, res, graph, { member: true });
};

/**
 * `GET /api/dfc/Enterprises` — the LDP container of enterprises this hub may
 * see. Deliberately *not* shop-scoped: the caller's `client_id` decides which
 * shops are listed (see `getAllShopNames`), which is the pre-existing
 * behaviour. `ldp:contains` carries one member description per enterprise; the
 * full representation lives at the member URI.
 */
export const getEnterprises = async (req, res) => {
  const connector = await loadConnectorWithResources();
  const shopNames = await getAllShopNames(
    req.shop?.ordersFeatureEnabled ? null : req.tokenSet.client_id
  );

  const { members } = graphToMembers(
    await connector.export(
      ...shopNames.map(
        (enterpriseName) => connector.createEnterprise(
          absoluteUri('api/dfc/Enterprises', enterpriseName)
        )
      )
    )
  );

  return sendLdp(req, res, 200, buildContainer(containerUri('api/dfc/Enterprises'), members), {
    container: true
  });
};

/**
 * Enterprises are read-only on this dataserver: an enterprise *is* a Shopify
 * shop, so creating or deleting one is an app install/uninstall, which is not
 * an LDP write. `Allow` states the read-only contract so a client can discover
 * why without guessing.
 *
 * Reached without `checkScopePermissions` on purpose — see app.js. With scope
 * enforcement active the matrix has no write row for this path, so the scope
 * check answers 404 and this handler never runs, which would make the promised
 * 405 hold only for the orders-feature shortcut.
 */
export const enterprisesAreReadOnly = (req, res) => {
  res.set('Allow', 'GET, HEAD, OPTIONS');
  return sendProblem(req, res, 405, {
    title: 'Method not allowed',
    detail: 'Enterprises are provisioned by installing the app on a Shopify shop, not via LDP writes. '
      + 'Use PUT/PATCH/DELETE on the member resources (SuppliedProducts, Orders) instead.'
  });
};
