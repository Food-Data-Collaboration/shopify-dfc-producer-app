import { Issuer } from 'openid-client'
import loadConnectorWithResources from '../web/connector/index.js';
import { OrderLine, Order, SaleSession, Offer, SuppliedProduct } from '@fooddatacollaboration/linkml-connector';
import axios from 'axios';
import * as ids from '../web/fdc-modules/orders/controllers/shopify/ids.js';

describe('orders', () => {

    const refreshToken = '';
    const product1 = '';
    const product2 = '';
    const product3 = '';
    const product4 = '';
    const timeout = 20000;
    const SHOP_NAME = ''
    const PRODUCER_SHOP_URL = 'http://localhost:36329/'

    let accessToken, connector = null;

    let producerLines = {};
    let orderId = null;

    beforeAll(async () => {
        const issuer = await Issuer.discover(process.env.OIDC_ISSUER);

        const client = new issuer.Client({
            client_id: process.env.OIDC_CLIENT_ID,
            client_secret: process.env.OIDC_CLIENT_SECRET,
            respose_types: ['code'],
            redirect_uris: [process.env.OIDC_CALLBACK_URL],
        });

        accessToken = (await client.refresh(refreshToken)).access_token;
        connector = await loadConnectorWithResources();
    });

    it('Can create a new order', async () => {
        
        const lines = [
            { productId: product1, quantity: 5 },
            { productId: product2, quantity: 3 },
        ];

        const orderGraph = await connector.export(...createOrder({ orderId: null, lines }), createSalesSession());

        const { order, orderLines } = await sendOrder(axios.post, 'Orders', orderGraph);

        expect(order.hasOrderStatus).toBe('dfc-v:Held');
        expect(orderLines.length).toBe(2);

        await assertLine({ line: orderLines[0], quantity: 5, productId: product1 });
        await assertLine({ line: orderLines[1], quantity: 3, productId: product2 });

    }, timeout);

    it('Can update an existing order', async () => {
        const lines = [
            { id: producerLines[product1], productId: product1, quantity: 6 },
            { id: producerLines[product2], productId: product2, quantity: 2 },
            { productId: product3, quantity: 1 },
        ];

        const orderGraph = await connector.export(...createOrder({ orderId, lines }));

        const { order, orderLines } = await sendOrder(axios.put, `Orders/${orderId}`, orderGraph);

        expect(ids.extract(order.semanticId)).toBe(orderId);
        expect(order.hasOrderStatus).toBe('dfc-v:Held');

        await assertLine({ line: orderLines[0], quantity: 6, productId: product1 });
        await assertLine({ line: orderLines[1], quantity: 2, productId: product2 });
        await assertLine({ line: orderLines[2], quantity: 1, productId: product3 });
    }, timeout);

    it('Can GET an order', async () => {
        const graph = await get(`Orders/${orderId}`);
        const {order, orderLines} = await extractOrderAndLines(graph);

        expect(ids.extract(order.semanticId)).toBe(orderId);
        expect(order.hasOrderStatus).toBe('dfc-v:Held');

        await assertLine({ line: orderLines[0], quantity: 6, productId: product1 });
        await assertLine({ line: orderLines[1], quantity: 2, productId: product2 });
        await assertLine({ line: orderLines[2], quantity: 1, productId: product3 });
    }, timeout);

    it('Can GET an orders lines', async () => {
        const orderLines = (await get(`Orders/${orderId}/orderLines`)).filter(item => item instanceof OrderLine);

        await assertLine({ line: orderLines[0], quantity: 6, productId: product1 });
        await assertLine({ line: orderLines[1], quantity: 2, productId: product2 });
        await assertLine({ line: orderLines[2], quantity: 1, productId: product3 });
    }, timeout);

    it('Can page through an orders lines', async () => {
        const orderLines = (await get(`Orders/${orderId}/orderLines?first=2`)).filter(item => item instanceof OrderLine);

        expect(orderLines).toHaveLength(2);
    }, timeout);

    it('Can GET an single line', async () => {
        const line = (await get(`Orders/${orderId}/orderLines/${producerLines[product2]}`)).filter(item => item instanceof OrderLine)[0];
        
        await assertLine({ line, quantity: 2, productId: product2 });
    }, timeout);

    it('Can create a new line', async () => {
        const lineGraph = await connector.export(...createOrderLineGraph(orderId)({productId: product4, quantity: 5}, 0));

        const line = await sendLine(axios.post, `Orders/${orderId}/orderLines`, lineGraph);
        
        await assertLine({ line, quantity: 5, productId: product4 });
    }, timeout);

    it('Can update a line', async () => {
        const lineGraph = await connector.export(...createOrderLineGraph(orderId)({id:  producerLines[product4], productId: product4, quantity: 10}, 0));

        const line = await sendLine(axios.put, `Orders/${orderId}/orderLines/${producerLines[product4]}`, lineGraph);
        
        await assertLine({ line, quantity: 10, productId: product4 });
    }, timeout);

    it('Can complete an order', async () => {
        const lines = [
            { id: producerLines[product1], productId: product1, quantity: 7 },
            { id: producerLines[product2], productId: product2, quantity: 2 }
        ];

        const orderGraph = await connector.export(...createOrder({ orderId, lines, status: 'dfc-v:Complete' }));

        const { order, orderLines } = await sendOrder(axios.put, `Orders/${orderId}`, orderGraph);

        expect(ids.extract(order.semanticId)).toBe(orderId);
        expect(order.hasOrderStatus).toBe('dfc-v:Complete');

        expect(orderLines.length).toBe(2);

        await assertLine({ line: orderLines[0], quantity: 7, productId: product1 });
        await assertLine({ line: orderLines[1], quantity: 2, productId: product2 });
    }, timeout);

    it('Can bulk get Orders', async () => {
        const graph = await get(`Orders`);
        
        const orders = graph.filter(item => item instanceof Order);

        expect(orders.length).toBeGreaterThan(0);
    }, timeout);

    async function asArray(value) {
        return Array.isArray(value) ? value : [value];
    }

    async function get(endpoint) {
        const result = await axios.get(`${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/${endpoint}`,
            {
                transformResponse: (res) => {
                    return res;
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'JWT ' + accessToken
                }
            }
        );
        expect(result.status).toBe(200);
        return asArray(connector.import(result.data));
    }

    async function sendOrder(method, endpoint, data) {
        const result = await method(`${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/${endpoint}`,
            data,
            {
                transformResponse: (res) => {
                    return res;
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'JWT ' + accessToken
                }
            }
        );
        expect(result.status).toBe(200);
        const rehydrated = asArray(connector.import(result.data));
        const order = rehydrated.filter((item) => item instanceof Order)[0];
        orderId = ids.extract(order.semanticId);
        const orderLines = Array.isArray(order.hasPart) ? order.hasPart : (order.hasPart ? [order.hasPart] : []);
        return { order, orderLines };
    }

    async function sendLine(method, endpoint, data) {
        const result = await method(`${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/${endpoint}`,
            data,
            {
                transformResponse: (res) => {
                    return res;
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'JWT ' + accessToken
                }
            }
        );
        expect(result.status).toBe(200);
        const rehydrated = asArray(connector.import(result.data));
        return rehydrated.filter((item) => item instanceof OrderLine)[0];
    }

    async function extractOrderAndLines(graph){
        const items = asArray(graph);
        const order = items.filter((item) => item instanceof Order)[0];
        const orderLines = Array.isArray(order.hasPart) ? order.hasPart : (order.hasPart ? [order.hasPart] : []);
        return { order, orderLines };
    }

    async function assertLine({ line, quantity, productId }) {
        const id = ids.extract(line.semanticId);

        const concerns = Array.isArray(line.concerns) ? line.concerns : [line.concerns];
        const offer = concerns[0];
        const products = Array.isArray(offer.offers) ? offer.offers : [offer.offers];
        const product = products[0];

        expect(line.quantity).toBe(quantity);
        expect(ids.extract(typeof product === 'string' ? product : product.semanticId)).toBe(productId);
        producerLines[productId] = id;
    }

    function createOrder({ orderId, lines, status = 'dfc-v:Held' }) {
        const orderLines = lines.flatMap(createOrderLineGraph(orderId))
        const order = connector.createOrder(
            `${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/Orders/${orderId ? orderId : '#'}`,
            {
                hasPart: orderLines.filter((item) => item instanceof OrderLine).map(l => l.semanticId),
                hasOrderStatus: status
            }
        );

        return [order, ...orderLines];
    }

    function createSalesSession() {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        return connector.createSaleSession(
            `${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/SalesSession/#`,
            {
                startDate: startDate.toString(),
                endDate: endDate.toString(),
            }
        );
    }

    function createOrderLineGraph(orderId) {
        return (line, i) => {
            const suppliedProduct = connector.createSuppliedProduct(
                `${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/SuppliedProducts/${line.productId}`
            );

            const offer = connector.createOffer(
                `${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/Offers/${i + 1}`,
                { offers: suppliedProduct.semanticId }
            );

            const orderLine = connector.createOrderLine(
                `${PRODUCER_SHOP_URL}api/dfc/Enterprises/${SHOP_NAME}/Orders/${orderId || '#'}/OrderLines/${line.id ? line.id : i + 1}`,
                {
                    quantity: line.quantity,
                    concerns: [offer.semanticId]
                }
            );

            return [offer, orderLine, suppliedProduct]
        }
    }

});
