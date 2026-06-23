import * as ids from './ids.js'
import { requestWithRetry } from './retryClient.js'

const PAY_ON_RECEIPT = "gid://shopify/PaymentTermsTemplate/1";

export async function findOrder(client, orderId, { first, last, after, before }) {
    const firstToUse = first ? first : last ? null : 250;
    const response = await requestWithRetry(client,`query MyQuery($id: ID!, $first: Int, $last: Int, $after: String, $before: String) {
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

export async function findOrders(client, customerId, { first, last, after, before }) {

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

    const firstToUse = first ? first : last ? null : 250;

    const response = await requestWithRetry(client,query, {
        variables: { first: firstToUse, last, after, before }
    });

    if (response.errors) {
        console.error('Failed to load Orders', JSON.stringify(response.errors));
        throw new Error('Failed to load Orders');
    }

    return {
        orders: response.data.draftOrders.nodes.map(order => ({...order, lineItems: order.lineItems.nodes})),
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

    const response = await requestWithRetry(client,query, {
        variables: {
            "input": {
                "purchasingEntity": {
                    "customerId": customerId
                },
                "note": "FDC Order",
                "email": customerEmail,
                "reserveInventoryUntil": reservationDate.toISOString(),
                "tags": ['fdc'],
                "lineItems": lines,
                "paymentTerms": {
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

    return {...response.data.draftOrderCreate.draftOrder, lineItems: response.data.draftOrderCreate.draftOrder.lineItems.nodes};
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

    const response = await requestWithRetry(client,query, {
        variables: {
            "id": ids.draftOrder(orderId),
            "input": {
                "lineItems": atLeastOneLine,
                ...(reservationDate ? { "reserveInventoryUntil": lines.length === 0 || inThePast(reservationDate) ? null : reservationDate.toISOString() } : {})
            }
        },
    });

    if (response.errors) {
        console.error('Failed to update draft order', JSON.stringify(response.errors));
        throw new Error('Failed to update order');
    }

    if (response.data.draftOrderUpdate.userErrors.length > 0) {
        console.error('Failed to update draft order', JSON.stringify(response.data.draftOrderUpdate.userErrors));
        throw new Error('Failed to update order');
    }

    return {...response.data.draftOrderUpdate.draftOrder, lineItems: response.data.draftOrderUpdate.draftOrder.lineItems.nodes};
}

function inThePast(date){
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


    const response = await requestWithRetry(client,query, {
        variables: {
            "id": ids.draftOrder(orderId)
        },
    });

    if (response.errors) {
        console.error('Failed to create draft order', JSON.stringify(response.errors));
        throw new Error('Failed to create order');
    }

    if (response.data.draftOrderComplete.userErrors.length > 0) {
        console.error('Failed to complete draft order', JSON.stringify(response.data.draftOrderComplete.userErrors));
        throw new Error('Failed to complete draft order');
    }

    return {...response.data.draftOrderComplete.draftOrder, lineItems: response.data.draftOrderComplete.draftOrder.lineItems.nodes};
}

export async function dfcLineToShopifyLine(dfcLine) {
    const offer = await dfcLine.getOffer();
    const product = await offer.getOfferedItem();
    return {
        variantId: ids.variant(ids.extract(product.getSemanticId())),
        quantity: dfcLine.getQuantity()
    }
}

function shopifyOutputLineToInputLine(shopifyOutputLine) {
    return {
        variantId: shopifyOutputLine.variant.id,
        quantity: shopifyOutputLine.quantity
    }
}

export async function createUpdatedShopifyLines(draftOrder, dfcOrderLine) {
    const { lines, hasBeenReplacement } = await draftOrder.lineItems.reduce(
        async (accumulator, shopifyOutputLine) => {
            const { lines, hasBeenReplacement } = await accumulator;

            const offer = await dfcOrderLine.getOffer();
            const product = await offer.getOfferedItem();

            if (ids.extract(shopifyOutputLine.variant.id) === ids.extract(await product.getSemanticId())) {
                return { lines: [...lines, await dfcLineToShopifyLine(dfcOrderLine)], hasBeenReplacement: true };
            } else {
                return { lines: [...lines, shopifyOutputLineToInputLine(shopifyOutputLine)], hasBeenReplacement };
            }
        },
        { lines: [], hasBeenReplacement: false })

    return hasBeenReplacement ? lines : [...lines, await dfcLineToShopifyLine(dfcOrderLine)];
}
