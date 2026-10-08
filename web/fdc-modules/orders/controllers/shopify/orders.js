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
    orders: response.data.draftOrders.nodes.map((order) => ({
      ...order,
      lineItems: order.lineItems.nodes
    })),
    pageInfo: response.data.draftOrders.pageInfo
  };
}

export async function createShopifyOrder(
  client,
  customerId,
  customerEmail,
  reservationDate,
  lines
) {
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

  const { draftOrder } = response.data.draftOrderCreate;
  return { ...draftOrder, lineItems: draftOrder.lineItems.nodes };
}

function inThePast(date) {
  const now = new Date();
  return date < now;
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

  // An absent reservation date means "leave it alone", so the key is omitted
  // entirely. A date that has passed — or the placeholder line standing in for
  // an emptied order — sends `null`, which is how Shopify is told to release a
  // reservation that was previously taken.
  const reservation = reservationDate && {
    reserveInventoryUntil: lines.length === 0 || inThePast(reservationDate)
      ? null
      : reservationDate.toISOString()
  };

  const response = await client.request(query, {
    variables: {
      id: ids.draftOrder(orderId),
      input: {
        lineItems: atLeastOneLine,
        ...reservation
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

  const { draftOrder } = response.data.draftOrderUpdate;
  return { ...draftOrder, lineItems: draftOrder.lineItems.nodes };
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

  const { draftOrder } = response.data.draftOrderComplete;
  return { ...draftOrder, lineItems: draftOrder.lineItems.nodes };
}

/**
 * Resolve the SuppliedProduct behind an OrderLine.
 *
 * A v2 OrderLine points at an `Offer`, whose `offers` is a **CatalogItem**,
 * whose `references` is the SuppliedProduct. Walking that chain matters: taking
 * `offers[0]` as the product would send the CatalogItem's last URI segment
 * (usually the literal "CatalogItem") as a Shopify variant id, so the lookup
 * misses and the line is dropped or mispriced.
 *
 * Two shapes are accepted, both of which occur in practice:
 *   - v2:      Offer -> CatalogItem -> `references` -> SuppliedProduct
 *   - pre-v2:  Offer -> SuppliedProduct directly on `offers`
 *   and within each, references may already be resolved objects or bare ids.
 *
 * Returns null when none of them resolve. Callers must **not** substitute the
 * order line's own id: `ids.extract` would reduce that to the external line
 * id and produce `gid://shopify/ProductVariant/10001-01`. Use
 * `requireSuppliedProductId`, which fails loudly.
 */
function suppliedProductIdFor(dfcLine) {
  const asArray = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);
  const idOf = (value) => (typeof value === 'string' ? value : value?.semanticId);

  // The product behind a single `Offer.offers` entry, or undefined when this
  // entry is not something we can resolve. Ordered most-authoritative first.
  const productFor = (candidate) => {
    // Pre-v2 senders put the product straight on `offers`. `semanticType` is
    // authoritative here, and it is what makes this distinguishable at all: a
    // relative id like '888' carries no path segment to match on.
    if (candidate?.semanticType === 'dfc-b:SuppliedProduct') {
      return idOf(candidate);
    }

    // v2: the resolved CatalogItem carries the product on `references`.
    const references = asArray(candidate?.references);
    if (references.length > 0) {
      return idOf(references[0]);
    }

    // Otherwise the connector handed back a bare id. Our CatalogItems are
    // minted as `<product>/CatalogItem`, so the product id is the prefix.
    const id = idOf(candidate);
    if (typeof id !== 'string') {
      return undefined;
    }

    if (id.endsWith('/CatalogItem')) {
      return id.slice(0, -'/CatalogItem'.length);
    }

    // An unresolved id on the SuppliedProducts path is the product itself.
    return id.includes('/SuppliedProducts/') ? id : undefined;
  };

  const candidates = asArray(dfcLine.concerns).flatMap((offer) => asArray(offer?.offers));

  // The first entry that resolves wins; the rest are a fallback for the
  // pathological line that carries several offers.
  return candidates.map(productFor).find(Boolean) ?? null;
}

/**
 * `suppliedProductIdFor`, but an unresolvable chain is a client error rather
 * than a value to guess at.
 *
 * The distinction matters because the two failure shapes are not equivalent: a
 * bogus variantId surfaces as a 500 from Shopify, whereas falling through
 * `createUpdatedShopifyLines`'s replacement check silently appends a duplicate
 * line to the order. Neither is acceptable, so the caller gets a 422 it can act
 * on instead.
 */
export function requireSuppliedProductId(dfcLine) {
  const semanticId = suppliedProductIdFor(dfcLine);

  if (!semanticId) {
    const error = new Error(
      'Could not resolve the ordered SuppliedProduct. Expected '
      + 'OrderLine -> Offer -> CatalogItem -> SuppliedProduct: in DFC v2 '
      + '`dfc-b:Offer.offers` is a CatalogItem, and that CatalogItem must carry '
      + '`dfc-b:references` pointing at the product.'
    );
    error.status = 422;
    error.title = 'Unprocessable entity';
    throw error;
  }

  return semanticId;
}

export { suppliedProductIdFor };

export async function dfcLineToShopifyLine(dfcLine) {
  return {
    variantId: ids.variant(ids.extract(requireSuppliedProductId(dfcLine))),
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
  // Resolved once, up front, and allowed to throw: if this fails we must not
  // fall through to the replacement check below, because with an unresolvable
  // id that check never matches and the line would be appended as a duplicate
  // rather than replacing the existing one.
  const targetVariantId = ids.extract(requireSuppliedProductId(dfcOrderLine));
  const isTarget = (line) => ids.extract(line.variant.id) === targetVariantId;

  // A matched line is replaced *in place* rather than moved to the end: line
  // order is the draft order's display order, so reordering would be a visible
  // change to the order the merchant sees.
  const lines = await Promise.all(
    draftOrder.lineItems.map((line) => (
      isTarget(line) ? dfcLineToShopifyLine(dfcOrderLine) : shopifyOutputLineToInputLine(line)
    ))
  );

  // Nothing matched, so the line is new and belongs at the end.
  return draftOrder.lineItems.some(isTarget)
    ? lines
    : [...lines, await dfcLineToShopifyLine(dfcOrderLine)];
}
