import { PhoneNumber } from '@datafoodconsortium/connector';
import shopify from '../../shopify.js';
import getShopDetails from './shopify/shop.js';
import getSession from '../../utils/getShopifySession.js';
import loadConnectorWithResources from '../../connector/index.js';

const getEnterprise = async (req, res) => {
  try {
    const session = await getSession(`${req.params.EnterpriseName}.myshopify.com`);
    const client = new shopify.api.clients.Graphql({ session });

    const {
      description, contactEmail, billingAddress, primaryDomain, name
    } = await getShopDetails(client);

    const connector = await loadConnectorWithResources();

    const enterprise = connector.createEnterprise({ semanticId: `/api/dfc/Enterprises/${req.params.EnterpriseName}`, description });

    const address = connector.createAddress({
      semanticId: `/api/dfc/Enterprises/${req.params.EnterpriseName}/Addresses/1`,
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
    enterprise.setName(name);

    const graph = await connector.export([enterprise, address]);
    res.type('application/json');
    res.send(graph);
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
};

export default getEnterprise;
