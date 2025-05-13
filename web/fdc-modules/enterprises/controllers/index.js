import { PhoneNumber } from '@datafoodconsortium/connector';
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
    description, contactEmail, billingAddress, primaryDomain, name, shopOwnerName
  } = await getShopDetails(client);

  const connector = await loadConnectorWithResources();

  const [firstName, lastName] = shopOwnerName.split(' ');
  const mainContact = connector.createPerson({ semanticId: `/api/dfc/Enterprises/${enterpriseName}#mainContact`, firstName, lastName });

  const logo = await getLogo(enterpriseName, storeFrontAccessToken);

  const enterprise = connector.createEnterprise({
    semanticId: `/api/dfc/Enterprises/${enterpriseName}`, description, mainContact, logo
  });

  const address = connector.createAddress({
    semanticId: `/api/dfc/Enterprises/${enterpriseName}/Addresses/1`,
    street: billingAddress.address2,
    postalCode: billingAddress.zip,
    city: billingAddress.city,
    country: billingAddress.country
  });

  if (billingAddress.region) {
    address.setRegion(billingAddress.region);
  }

  enterprise.addLocalization(address);

  if (billingAddress.phone) {
    enterprise.addPhoneNumber(PhoneNumber(billingAddress.phone));
  }

  enterprise.addEmailAddress(contactEmail);
  enterprise.addWebsite(primaryDomain.url);
  enterprise.setName(name);

  const variants = await getVariants(enterpriseName);

  variants
    .filter((variant) => variant.enabled)
    .map((variant) => connector.createSuppliedProduct({
      semanticId: `/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts/${variant.id}`
    }))
    .forEach((product) => enterprise.supplyProduct(product));

  return [enterprise, address, mainContact];
};

export const getEnterprise = async (req, res) => {
  try {
    const connector = await loadConnectorWithResources();
    const graph = await connector.export(
      await buildSingleEnterprise(req.params.EnterpriseName, req.shop.storeFrontAccessToken)
    );
    res.type('application/json');
    res.send(graph);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

export const getEnterprises = async (req, res) => {
  try {
    const connector = await loadConnectorWithResources();
    const shopNames = await getAllShopNames();
    const graph = await connector.export(shopNames.map((enterpriseName) => connector.createEnterprise({ semanticId: `/api/dfc/Enterprises/${enterpriseName}` })));
    res.type('application/json');
    res.send(graph);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};
