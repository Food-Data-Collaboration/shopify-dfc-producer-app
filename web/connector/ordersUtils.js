import { OrderLine, Person } from '@datafoodconsortium/connector';
import { getTargetStringFromSemanticId, throwError } from '../utils/index.js';

import loadConnectorWithResources from './index.js';

const DFC_CONTEXT_W3ID = 'https://w3id.org/dfc/ontology/context/context_1.16.0.json';
const DFC_CONTEXT_PRELOADED = 'https://www.datafoodconsortium.org/wp-content/plugins/wordpress-context-jsonld/context_1.16.0.jsonld';

function normalizeContext(payload) {
  if (typeof payload === 'string') {
    return payload.replaceAll(DFC_CONTEXT_W3ID, DFC_CONTEXT_PRELOADED);
  }
  if (payload && typeof payload === 'object' && payload['@context'] === DFC_CONTEXT_W3ID) {
    return { ...payload, '@context': DFC_CONTEXT_PRELOADED };
  }
  return payload;
}

async function getOrderLine(order) {
  try {
    const semanticId = order.getSemanticId();

    return {
      variant_id: getTargetStringFromSemanticId(semanticId, 'lineItem'),
      quantity: order.getQuantity()
    };
  } catch (error) {
    throwError('Error fetching single orderLine', error);
  }

  return null;
}

async function getCustomer(connector, dfcCustomer) {
  let importedCustomers = await connector.import(normalizeContext(dfcCustomer));
  if (!Array.isArray(importedCustomers) || !importedCustomers.length) {
    throwError('Error importing Customers: no imports');
  }

  importedCustomers = importedCustomers.filter(
    (importedCustomer) => importedCustomer instanceof Person
  );

  return {
    first_name: importedCustomers[0].getFirstName(),
    last_name: importedCustomers[0].getLastName(),
    email: importedCustomers[0].getLastName()
  };
}
async function getOrder(connector, dfcOrder) {
  let importedOrders = await connector.import(normalizeContext(dfcOrder));
  if (!Array.isArray(importedOrders) || !importedOrders.length) {
    throwError('Error importing Orders: no imports');
  }

  importedOrders = importedOrders.filter(
    (importedProduct) => importedProduct instanceof OrderLine
  );

  return Promise.all(
    importedOrders.map((order) => {
      try {
        return getOrderLine(order);
      } catch (error) {
        throwError(
          'Error getting supplied product details from imports',
          error
        );
      }
      return null;
    })
  );
}

async function importDFCConnectorOrder(dfcOrder) {
  try {
    const connector = await loadConnectorWithResources();
    let jsonString = dfcOrder;
    if (typeof dfcOrder === 'object') {
      jsonString = JSON.stringify(dfcOrder);
    }
    return await getOrder(connector, jsonString);
  } catch (error) {
    throwError('Error generating Shopify FDC orders', error);
  }

  return null;
}

export async function importDFCConnectorCustomer(dfcCustomer) {
  try {
    const connector = await loadConnectorWithResources();
    let jsonString = dfcCustomer;
    if (typeof dfcCustomer === 'object') {
      jsonString = JSON.stringify(dfcCustomer);
    }
    return await getCustomer(connector, jsonString);
  } catch (error) {
    throwError('Error generating Shopify FDC Customer', error);
  }

  return null;
}

export default importDFCConnectorOrder;
