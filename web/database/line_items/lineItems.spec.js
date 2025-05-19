import { createOrUpdateLineItems, getLineItems, getAllLineItems } from './lineItems';
import { pool } from '../connect';

describe('lineItems', () => {
    beforeEach(async () => {
        await pool.query(`truncate table line_items restart identity`);
    });

    afterAll(async () => {
        await pool.query(`truncate table line_items restart identity`);
    });

    it('Can be rembered and recalled', async () => {
        await createOrUpdateLineItems(5, [{ id: 1234, variantId: 55 }, { id: 56678, variantId: 67 }]);
        const result = await getLineItems(5);
        expect(result).toStrictEqual([{ externalId: 1, shopifyId: "1234", variantId: "55" }, { externalId: 2, shopifyId: "56678", variantId: "67" }])
    });

    it('Can be updated', async () => {
        await createOrUpdateLineItems(5, [{ id: 1, variantId: 55 }, { id: 2, variantId: 67 }]);
        await createOrUpdateLineItems(5, [{ id: 3, variantId: 55 }, { id: 4, variantId: 67 }, { id: 5, variantId: 90 }]);
        const result = await getLineItems(5);
        expect(result).toStrictEqual([
            { variantId: "55", externalId: 1, shopifyId: "3" },
             { variantId: "67", externalId: 2, shopifyId: "4" },
              { variantId: "90", externalId: 5, shopifyId: "5" }
        ]);
    });

    it('Can be loaded in bulk', async () => {
        await createOrUpdateLineItems(1001, [{ id: 9000, variantId: 55 }, { id: 9001, variantId: 56 }]);
        await createOrUpdateLineItems(1002, [{ id: 9003, variantId: 56 }]);
        const result = await getAllLineItems();
        expect(result).toStrictEqual([
            { draftOrderId: "1001", lineItems: [
                { draftOrderId: "1001", externalId: 2, shopifyId: "9001", variantId: "56" },
                { draftOrderId: "1001", externalId: 1, shopifyId: "9000", variantId: "55" }
            ] },
            { draftOrderId: "1002", lineItems: [{ draftOrderId: "1002", externalId: 3, shopifyId: "9003", variantId: "56" }] }
        ])
    });

    it('returns empty array for no order', async () => {
        expect(await getLineItems(1234)).toStrictEqual([]);
    })
});