import { Offer, Order, OrderLine, SaleSession } from '@fooddatacollaboration/linkml-connector';
import loadConnectorWithResources from '../../../connector/index.js';
import { createDfcOrderFromShopify, createDfcOrderLineFromShopify, createDfcOrderLinesFromShopify, extractOrderAndLines, extractOrderAndLinesAndSalesSession, extractOrderLine, createBulkDfcOrderFromShopify } from './dfc-order.js';

describe('dfc orders', () => {

    describe("Request", () => {
        let connector, orderRequest, orderLine1Request, orderLine2Request, salesSessionRequest;

        beforeEach(async () => {
            connector = await loadConnectorWithResources();

            orderLine1Request = new OrderLine(
                'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
                { quantity: 5 }
            );

            orderLine2Request = new OrderLine(
                'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-02',
                { quantity: 10 }
            );

            orderRequest = new Order(
                'http://test.host/api/dfc/Enterprises/10000/Orders/10001',
                {
                    hasPart: [orderLine1Request.semanticId, orderLine2Request.semanticId],
                    hasOrderStatus: 'dfc-v:Held',
                }
            );

            salesSessionRequest = new SaleSession(
                'http://test.host/api/dfc/SalesSession/#',
                {
                    startDate: '2024-03-14T01:00:00+01:00',
                    endDate: '2024-03-20T01:00:00+01:00',
                }
            );
        })

        it('Can extract dfc order and lines from request payload', async () => {
            const orderPayload = await connector.export(orderRequest, orderLine1Request, orderLine2Request, salesSessionRequest);
            const { order, saleSession } = await extractOrderAndLinesAndSalesSession(orderPayload)

            expect(order.semanticType).toBe('dfc-b:Order')

            const lines = Array.isArray(order.hasPart) ? order.hasPart : [order.hasPart];
            expect(lines).toHaveLength(2);
            expect(lines[0].quantity).toBe(5);

            expect(saleSession.semanticType).toBe('dfc-b:SaleSession')
            expect(saleSession.endDate).toBe('2024-03-20T01:00:00+01:00')
        });

        it('Order extraction will fail if order is missing', async () => {
            const orderPayload = await connector.export(orderLine1Request, orderLine2Request, salesSessionRequest)

            expect.assertions(1);
            return extractOrderAndLinesAndSalesSession(orderPayload).catch(error => {
                expect(error.message).toBe('Order missing')
            })
        });

        it('Order extraction will fail if lines are missing', async () => {
            const orderPayload = await connector.export(orderRequest, orderLine1Request, salesSessionRequest)

            expect.assertions(1);
            return extractOrderAndLinesAndSalesSession(orderPayload).catch(error => {
                expect(error.message).toBe('Graph is missing OrderLine')
            })
        });

        it('Order extraction will fail if sales session is missing', async () => {
            const orderPayload = await connector.export(orderRequest, orderLine1Request, orderLine2Request)

            expect.assertions(1);
            return extractOrderAndLinesAndSalesSession(orderPayload).catch(error => {
                expect(error.message).toBe('Graph must contain single SalesSession')
            })
        });

        it('Can extract dfc order line from request payload', async () => {
            const orderLinePayload = await connector.export(orderLine1Request)
            const deserialisedOrderLine = await extractOrderLine(orderLinePayload)
            expect(deserialisedOrderLine.semanticType).toBe('dfc-b:OrderLine')
        });

        it('Single OrderLine extraction will fail if OrderLine is missing', async () => {
            const orderPayload = await connector.export(new Offer('http://myplatform.com/Product2'))

            expect.assertions(1);
            return extractOrderLine(orderPayload).catch(error => {
                expect(error.message).toBe('Single OrderLine not present in graph')
            })
        });

        it('Single OrderLine extraction will fail if multiple OrderLines', async () => {
            const orderPayload = await connector.export(orderLine1Request, orderLine2Request)

            expect.assertions(1);
            return extractOrderLine(orderPayload).catch(error => {
                expect(error.message).toBe('Single OrderLine not present in graph')
            })
        });
    });

    describe("From Shopify", () => {

        function shopifyOrder({
            id = 'gid://shopify/DraftOrder/1166522712371',
            lineItems = [
                {
                    "id": "gid://shopify/DraftOrderLineItem/58380080054579",
                    "quantity": 5,
                    "originalUnitPriceSet": {
                        "shopMoney": {
                            "amount": "104.56",
                            "currencyCode": "GBP"
                        }
                    },
                    "custom": false,
                    "variant": {
                        "id": "gid://shopify/ProductVariant/44519466336563",
                        "title": "Small case, 6 x 100ml",
                    }
                },
                {
                    "id": "gid://shopify/DraftOrderLineItem/67543322145",
                    "quantity": 5,
                    "originalUnitPriceSet": {
                        "shopMoney": {
                            "amount": "200.00",
                            "currencyCode": "EUR"
                        }
                    },
                    "custom": false,
                    "variant": {
                        "id": "gid://shopify/ProductVariant/44519466336566",
                        "title": "Large case, 12 x 100ml",
                    }
                }
            ],
            status = "OPEN",
            order = null,
        } = {}) {
            return {
                "id": id,
                "status": status,
                "order": order,
                lineItems
            }
        }

        const idMappings = [
            {
                shopifyId: "58380080054579",
                externalId: "1",
            },
            {
                shopifyId: "67543322145",
                externalId: "2"
            }
        ];

        it('Can convert a shopify draft order to dfc order with lines', async () => {
            const dfcOutput = await createDfcOrderFromShopify(shopifyOrder(), idMappings, 'test-shop');
            expect(dfcOutput).toEqual(expect.any(String));
            const parsed = JSON.parse(dfcOutput);
            const graph = parsed['@graph'] || [parsed];
            const order = graph.find((n) => n['@type'] === 'dfc-b:Order');
            expect(order).toBeDefined();
            expect(order['dfc-b:Order:has_order_status']).toBeDefined();
            const orderLines = graph.filter((n) => n['@type'] === 'dfc-b:OrderLine');
            expect(orderLines).toHaveLength(2);
        });

        it('Can convert a shopify draft order to just lines', async () => {
            const dfcOutput = await createDfcOrderLinesFromShopify(shopifyOrder(), idMappings, 'test-shop', 12345);
            expect(dfcOutput).toEqual(expect.any(String));
            const parsed = JSON.parse(dfcOutput);
            const graph = parsed['@graph'] || [parsed];
            const orderLines = graph.filter((n) => n['@type'] === 'dfc-b:OrderLine');
            expect(orderLines).toHaveLength(2);
        });

        it('Can convert a shopify draft order to a single lines', async () => {
            const dfcOutput = await createDfcOrderLineFromShopify(shopifyOrder(), 2, idMappings, 'test-shop', 12345);
            expect(dfcOutput).toEqual(expect.any(String));
            const parsed = JSON.parse(dfcOutput);
            const graph = parsed['@graph'] || [parsed];
            const orderLine = graph.find((n) => n['@type'] === 'dfc-b:OrderLine');
            expect(orderLine).toBeDefined();
        });

        it('Single line that isnt found returns null', async () => {
            const dfcOutput = await createDfcOrderLineFromShopify(shopifyOrder(), 5, idMappings);
            expect(dfcOutput).toBe(null);
        });

        it('Can bulk convert many shopify draft orders', async () => {
            const bulkIdMappings = [
                { draftOrderId: "1166522712371", lineItems: idMappings },
                { draftOrderId: "1166522712372", lineItems: [{ shopifyId: "58380080054580", externalId: "666" }] }
            ];

            const shopifyOrder1 = shopifyOrder();
            const shopifyOrder2 = shopifyOrder({
                id: "gid://shopify/DraftOrder/1166522712372",
                status: "COMPLETED",
                lineItems: [
                    {
                        "id": "gid://shopify/DraftOrderLineItem/58380080054580",
                        "quantity": 5,
                        "originalUnitPriceSet": {
                            "shopMoney": {
                                "amount": "104.56",
                                "currencyCode": "GBP"
                            }
                        },
                        "custom": false,
                        "variant": {
                            "id": "gid://shopify/ProductVariant/44519466336564",
                            "title": "Small case, 6 x 100ml",
                        }
                    },
                ]
            });
            const dfcOutput = await createBulkDfcOrderFromShopify([shopifyOrder1, shopifyOrder2], bulkIdMappings, 'test-shop');
            expect(dfcOutput).toEqual(expect.any(String));
            const parsed = JSON.parse(dfcOutput);
            const graph = parsed['@graph'] || [parsed];
            const orders = graph.filter((n) => n['@type'] === 'dfc-b:Order');
            expect(orders).toHaveLength(2);
            const orderLines = graph.filter((n) => n['@type'] === 'dfc-b:OrderLine');
            expect(orderLines).toHaveLength(3);
        });

        it('Placeholder line is not exposed to DFC', async () => {
            const orderFromShopify = shopifyOrder({
                lineItems: [
                    {
                        "id": "gid://shopify/DraftOrderLineItem/58380080054579",
                        "quantity": 5,
                        "originalUnitPriceSet": {
                            "shopMoney": {
                                "amount": "0",
                                "currencyCode": "GBP"
                            }
                        },
                        "custom": true,
                        "variant": null
                    },
                ]
            });

            const lines = await createDfcOrderLinesFromShopify(orderFromShopify, {}, 'test-shop', '1234');

            expect(lines).toEqual(expect.any(String));
            const parsed = JSON.parse(lines);
            const graph = parsed['@graph'] || [];
            expect(graph.length).toBe(0);
        })

        describe("Order Status", () => {

            async function assertOrderStatus(inStatus, outStatus) {
                const dfcOutput = await createDfcOrderFromShopify(shopifyOrder({ id: 'gid://shopify/DraftOrder/999999', status: inStatus }), idMappings, 'test-shop');
                expect(dfcOutput).toEqual(expect.any(String));
                const parsed = JSON.parse(dfcOutput);
                const graph = parsed['@graph'] || [parsed];
                const order = graph.find((n) => n['@type'] === 'dfc-b:Order');
                expect(order).toBeDefined();
                expect(JSON.stringify(order)).toContain(`dfc-v:${outStatus}`);
            }

            test.each([["OPEN", "Held"], ["INVOICE_SENT", "Held"], ["COMPLETED", "Complete"]])(
                'Maps %s to %s',
                async (inStatus, outStatus) => {
                    await assertOrderStatus(inStatus, outStatus)
                },
            );
        });

        describe("Fulfilment Status", () => {
            async function assertFulfilmentStatus(inStatus, outStatus) {
                const order = {
                    displayFulfillmentStatus: inStatus
                };
                const dfcOutput = await createDfcOrderFromShopify(shopifyOrder({ status: "COMPLETED", order }), idMappings, 'test-shop');
                expect(dfcOutput).toEqual(expect.any(String));
                const parsed = JSON.parse(dfcOutput);
                const graph = parsed['@graph'] || [parsed];
                const orderNode = graph.find((n) => n['@type'] === 'dfc-b:Order');
                expect(orderNode).toBeDefined();
                if (outStatus) {
                    expect(JSON.stringify(orderNode)).toContain(`dfc-v:${outStatus}`);
                }
            }

            test.each([
                ["FULFILLED", "Fulfilled"],
                ["IN_PROGRESS", "Unfulfilled"],
                ["ON_HOLD", "Held"],
                ["OPEN", "Unfulfilled"],
                ["PARTIALLY_FULFILLED", "Unfulfilled"],
                ["PENDING_FULFILLMENT", "Unfulfilled"],
                ["RESTOCKED", "Unfulfilled"],
                ["SCHEDULED", "Held"],
                ["UNFULFILLED", "Unfulfilled"]
            ])(
                'Maps %s to %s',
                async (inStatus, outStatus) => {
                    await assertFulfilmentStatus(inStatus, outStatus)
                },
            );
        });
    });

});
