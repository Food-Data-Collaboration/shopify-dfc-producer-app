import * as ids from './ids.js';

const PAY_ON_RECEIPT = 'gid://shopify/PaymentTermsTemplate/1';

export async function findOrder(client, orderId, {
  first, last, after, before
}) {
  const firstToUse = first || (last ? null : 250);
  const response = await client.request(`query MyQuery($id: ID!, $first: Int, $last: Int, $after: String, $before: String) {
        draftOrder(id: $id) {
            id
            status
            reserveInventoryUntil
            order {
                id
                displayFulfillmentStatus
                cancelledAt
                closed
                fullyPaid
            }
            lineItems(first: $first, last: $last, after: $after, before: $before) {
                nodes {
                    id
                    quantity
                    originalUnitPriceSet {
                        shopMoney {
                            amount
                            currencyCode
                        }
                    }
                    custom
                    variant {
                        id
                    }
                }
                pageInfo {
                    hasPreviousPage
                    hasNextPage
                    startCursor
                    endCursor
                }
            }
        }
      }`, {
    variables: {
      id: ids.draftOrder(orderId),
      first: firstToUse,
      last,
      after,
      before
    }
  });

  if (response.errors) {
    console.error('Failed to load Order', JSON.stringify(response.errors));
    throw new Error('Failed to load Order');
  }

  return {
    order: {
      ...response.data.draftOrder,
      lineItems: response.data.draftOrder.lineItems.nodes
    },
    pageInfo: response.data.draftOrder.lineItems.pageInfo
  };
}

export async function findOrders(client, customerId, {
  first, last, after, before
}) {
  const query = `
    query findDraftOrders($first: Int, $last: Int, $after: String, $before: String) {
        draftOrders(first: $first, last: $last, after: $after, before: $before, query: "tag:fdc AND customer_id:${ids.extract(customerId)}") {
            nodes {
                id    
                status   
                reserveInventoryUntil
                order {
                    id
                    displayFulfillmentStatus
                    cancelledAt
                    closed
                    fullyPaid
                }
                lineItems(first: 250) {
                    nodes {
                        id
                        quantity
                        originalUnitPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                        custom
                        variant {
                            id
                        }
                    }
                } 
          }
          pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
        }
      }
  `;

  const firstToUse = first || (last ? null : 250);

  const response = await client.request(query, {
    variables: {
      first: firstToUse, last, after, before
    }
  });

  if (response.errors) {
    console.error('Failed to load Orders', JSON.stringify(response.errors));
    throw new Error('Failed to load Orders');
  }

  return {
    orders: response.data.draftOrders.nodes.map((order) => ({ ...order, lineItems: order.lineItems.nodes })),
    pageInfo: response.data.draftOrders.pageInfo
  };
}

export async function createShopifyOrder(client, customerId, customerEmail, reservationDate, lines) {
  const query = `mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          userErrors {
              field
              message
          }
          draftOrder  {
              id
              status
              reserveInventoryUntil
              order {
                  id
                  displayFulfillmentStatus
                  cancelledAt
                  closed
                  fullyPaid
              }
              lineItems(first: 250) {
                 nodes {
                    id
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                          amount
                          currencyCode
                      }
                    }
                    custom
                     variant {
                         id
                         title
                     }
                 }
             }
          }
        }
      }`;

  const response = await client.request(query, {
    variables: {
      input: {
        purchasingEntity: {
          customerId
        },
        note: 'FDC Order',
        email: customerEmail,
        reserveInventoryUntil: reservationDate.toISOString(),
        tags: ['fdc'],
        lineItems: lines,
        paymentTerms: {
          paymentTermsTemplateId: PAY_ON_RECEIPT
        }
      }
    }
  });

  if (response.errors) {
    console.error('Failed to create draft order', JSON.stringify(response.errors));
    throw new Error('Failed to create order');
  }

  if (response.data.draftOrderCreate.userErrors.length > 0) {
    console.error('Failed to create draft order', JSON.stringify(response.data.draftOrderCreate.userErrors));
    throw new Error('Failed to create order');
  }

  return { ...response.data.draftOrderCreate.draftOrder, lineItems: response.data.draftOrderCreate.draftOrder.lineItems.nodes };
}

export async function updateOrder(client, orderId, reservationDate, lines) {
  const atLeastOneLine = lines.length === 0 ? [{ title: 'placeholder', quantity: 1, originalUnitPrice: 0 }] : lines;

  const query = `mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          userErrors {
              field
              message
          }
          draftOrder  {
              id
              status
              reserveInventoryUntil
              order {
                  id
                  displayFulfillmentStatus
                  cancelledAt
                  closed
                  fullyPaid
              }
              lineItems(first: 250) {
                 nodes {
                    id
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                          amount
                          currencyCode
                      }
                    }
                    custom
                     variant {
                         id
                         title
                     }
                 }
             }
          }
        }
      }`;

  const response = await client.request(query, {
    variables: {
      id: ids.draftOrder(orderId),
      input: {
        lineItems: atLeastOneLine,
        ...(reservationDate ? { reserveInventoryUntil: lines.length === 0 || inThePast(reservationDate) ? null : reservationDate.toISOString() } : {})
      }
    }
  });

  if (response.errors) {
    console.error('Failed to update draft order', JSON.stringify(response.errors));
    throw new Error('Failed to update order');
  }

  if (response.data.draftOrderUpdate.userErrors.length > 0) {
    console.error('Failed to update draft order', JSON.stringify(response.data.draftOrderUpdate.userErrors));
    throw new Error('Failed to update order');
  }

  return { ...response.data.draftOrderUpdate.draftOrder, lineItems: response.data.draftOrderUpdate.draftOrder.lineItems.nodes };
}

function inThePast(date) {
  const now = new Date();
  return date < now;
}

export async function completeDraftOrder(client, orderId) {
  const query = `mutation CompleteDraftOrder($id: ID!) {
        draftOrderComplete(id: $id) {
          userErrors {
            field
            message
          }
          draftOrder {
            id
            status
            reserveInventoryUntil
            order {
                id
                displayFulfillmentStatus
                cancelledAt
                closed
                fullyPaid
            }
            lineItems(first: 250) {
                nodes {
                    id
                    quantity
                    originalUnitPriceSet {
                        shopMoney {
                            amount
                            currencyCode
                        }
                    }
                    custom
                    variant {
                        id
                        title
                    }
                }
            }
          }
        }
      }`;

  const response = await client.request(query, {
    variables: {
      id: ids.draftOrder(orderId)
    }
  });

  if (response.errors) {
    console.error('Failed to complete draft order', JSON.stringify(response.errors));
    throw new Error('Failed to create order');
  }

  if (response.data.draftOrderComplete.userErrors.length > 0) {
    console.error('Failed to complete draft order', JSON.stringify(response.data.draftOrderComplete.userErrors));
    throw new Error('Failed to complete draft order');
  }

  return { ...response.data.draftOrderComplete.draftOrder, lineItems: response.data.draftOrderComplete.draftOrder.lineItems.nodes };
}

export async function dfcLineToShopifyLine(dfcLine) {
  const offer = Array.isArray(dfcLine.concerns) ? dfcLine.concerns[0] : dfcLine.concerns;
  let semanticId;
  if (offer) {
    const product = Array.isArray(offer.offers) ? offer.offers[0] : offer.offers;
    semanticId = typeof product === 'string' ? product : product?.semanticId;
  } else {
    semanticId = dfcLine.semanticId;
  }
  return {
    variantId: ids.variant(ids.extract(semanticId)),
    quantity: dfcLine.quantity
  };
}

function shopifyOutputLineToInputLine(shopifyOutputLine) {
  return {
    variantId: shopifyOutputLine.variant.id,
    quantity: shopifyOutputLine.quantity
  };
}

export async function createUpdatedShopifyLines(draftOrder, dfcOrderLine) {
  const { lines, hasBeenReplacement } = await draftOrder.lineItems.reduce(
    async (accumulator, shopifyOutputLine) => {
      const { lines, hasBeenReplacement } = await accumulator;

      const offer = Array.isArray(dfcOrderLine.concerns) ? dfcOrderLine.concerns[0] : dfcOrderLine.concerns;
      let semanticId;
      if (offer) {
        const product = Array.isArray(offer.offers) ? offer.offers[0] : offer.offers;
        semanticId = typeof product === 'string' ? product : product?.semanticId;
      } else {
        semanticId = dfcOrderLine.semanticId;
      }

      if (ids.extract(shopifyOutputLine.variant.id) === ids.extract(semanticId)) {
        return { lines: [...lines, await dfcLineToShopifyLine(dfcOrderLine)], hasBeenReplacement: true };
      }
      return { lines: [...lines, shopifyOutputLineToInputLine(shopifyOutputLine)], hasBeenReplacement };
    },
    { lines: [], hasBeenReplacement: false }
  );

  return hasBeenReplacement ? lines : [...lines, await dfcLineToShopifyLine(dfcOrderLine)];
}
