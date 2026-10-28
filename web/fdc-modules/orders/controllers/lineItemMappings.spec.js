import { persistLineIdMappings } from './lineItemMappings'
import { pool } from '../../../database/connect'
describe('lineItemMappings', () => {

    beforeAll(async () => {
        await pool.query(`truncate table line_items restart identity`);
    });

    it('will store id mappings from shopify', async () => {
        // `lineItems` is a flat array, not `{ edges: [...] }`: every caller
        // (findOrder / createShopifyOrder / updateOrder in shopify/orders.js)
        // flattens `lineItems.nodes` before returning.
        const draftOrder = {
            id: 12345,
            lineItems: [
                {
                    id: 665,
                    quantity: 5,
                    variant: {
                        id: 99,
                        title: '500g x 12',
                        price: 55.603
                    }
                }
            ]
        };

        expect(await persistLineIdMappings(draftOrder)).toStrictEqual([{"externalId": 1, "shopifyId": "665", "variantId": "99"}]);
    });

    it('Can update the line id mappings so that the external id remains stable for a variant', async () => {
        const updatedDraftOrder = {
            id: 12345,
            lineItems: [
                {
                    id: 1234,
                    quantity: 5,
                    variant: {
                        id: 99,
                        title: '500g x 12',
                        price: 55.603
                    }
                },
                {
                    id: 5678,
                    quantity: 5,
                    variant: {
                        id: 100,
                        title: '99g',
                        price: 25
                    }
                }
            ]
        };

        expect(await persistLineIdMappings(updatedDraftOrder)).toStrictEqual(
            [
                { "externalId": 1, "shopifyId": "1234", "variantId": "99" },
                { "externalId": 3, "shopifyId": "5678", "variantId": "100" }
            ]
        );
    });
})