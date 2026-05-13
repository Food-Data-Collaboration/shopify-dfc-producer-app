import { OrderLine, Person } from '@fooddatacollaboration/linkml-connector';
import { getTargetStringFromSemanticId, throwError } from '../utils/index.js';

import loadConnectorWithResources from './index.js';

async function getOrderLine(order) {
  try {
    const semanticId = order.semanticId;

    return {
      variant_id: getTargetStringFromSemanticId(semanticId, 'lineItem'),
      quantity: order.quantity,
    };
  } catch (error) {
    throwError('Error fetching single orderLine', error);
  }

  return null;
}

async function getCustomer(connector, dfcCustomer) {
  let importedCustomers = connector.import(dfcCustomer);
  if (!Array.isArray(importedCustomers) || !importedCustomers.length) {
    throwError('Error importing Customers: no imports');
  }

  importedCustomers = importedCustomers.filter(
    (importedCustomer) => importedCustomer instanceof Person
  );

  return {
    first_name: importedCustomers[0].firstName,
    last_name: importedCustomers[0].familyName,
    email: importedCustomers[0].email,
  };
}

async function getOrder(connector, dfcOrder) {
  let importedOrders = connector.import(dfcOrder);
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
    return await getOrder(connector, dfcOrder);
  } catch (error) {
    throwError('Error generating Shopify FDC orders', error);
  }

  return null;
}

export async function importDFCConnectorCustomer(dfcCustomer) {
  try {
    const connector = await loadConnectorWithResources();
    return await getCustomer(connector, dfcCustomer);
  } catch (error) {
    throwError('Error generating Shopify FDC Customer', error);
  }

  return null;
}

export default importDFCConnectorOrder;
