import { PhoneNumber } from '@fooddatacollaboration/linkml-connector';
import shopify from '../../../shopify.js';
import getShopDetails from '../shopify/shop.js';
import getLogo from '../shopify/storefront.js';
import getSession from '../../../utils/getShopifySession.js';
import loadConnectorWithResources from '../../../connector/index.js';
import { getAllShopNames } from '../../../database/connect.js';
import {
  getVariants
} from '../../../database/variants/variants.js';

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

  const enterprise = connector.createOrganization(
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
      region: businessAddress.region,
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

  return [enterprise, address, mainContact, ...(phoneNumber ? [phoneNumber] : []), ...suppliedProducts];
};

export const getEnterprise = async (req, res) => {
  try {
    const connector = await loadConnectorWithResources();
    const graph = await connector.export(
      ...await buildSingleEnterprise(req.params.EnterpriseName, req.shop.storeFrontAccessToken)
    );
    res.type('application/json');
    res.send(JSON.stringify(graph));
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

export const getEnterprises = async (req, res) => {
  try {
    const connector = await loadConnectorWithResources();
    const shopNames = await getAllShopNames(
      req.shop?.ordersFeatureEnabled ? null : req.tokenSet.client_id
    );
    const enterprises = shopNames.map((enterpriseName) =>
      connector.createOrganization(`/api/dfc/Enterprises/${enterpriseName}`)
    );
    const graph = await connector.export(...enterprises);
    res.type('application/json');
    res.send(JSON.stringify(graph));
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};
