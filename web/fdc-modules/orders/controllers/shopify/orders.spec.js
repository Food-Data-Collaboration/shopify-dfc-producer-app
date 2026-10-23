import { CatalogItem, Offer, OrderLine, SuppliedProduct } from '@siol-data/linkml-connector';
import loadConnectorWithResources from '../../../../connector/index.js';
import {
    createUpdatedShopifyLines,
    dfcLineToShopifyLine,
    requireSuppliedProductId,
    suppliedProductIdFor
} from './orders.js'

describe('Orders', () => {

    let connector, draftOrder;

    beforeAll(async () => {
        connector = await loadConnectorWithResources();
        draftOrder = {
            id: 12345,
            lineItems: [
                {
                    id: 1234,
                    quantity: 5,
                    variant: {
                        id: "gid://shopify/ProductVariant/99",
                        title: '500g x 12',
                        price: 55.603
                    }
                },
                {
                    id: 5678,
                    quantity: 6,
                    variant: {
                        id: "gid://shopify/ProductVariant/100",
                        title: '99g',
                        price: 25
                    }
                }
            ]
        };
    })

    it('Will merge existing lines with a new dfc line to produce the shopify order line input shape', async () => {
        // v2 shape: OrderLine -> Offer -> CatalogItem -> SuppliedProduct.
        // The variant id comes from the product, three hops out.
        const suppliedProduct = new SuppliedProduct('999');
        const catalogItem = new CatalogItem('999/CatalogItem', { references: [suppliedProduct] });
        const offer = new Offer('999/Offer', { offers: [catalogItem] });
        const newDfcLine = new OrderLine(
            'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
            { quantity: 7, concerns: [offer] }
        );

        expect(await createUpdatedShopifyLines(draftOrder, newDfcLine)).toStrictEqual([
            {variantId: "gid://shopify/ProductVariant/99", quantity: 5},
            {variantId: "gid://shopify/ProductVariant/100", quantity: 6},
            {variantId: "gid://shopify/ProductVariant/999", quantity: 7},
        ]);
    });

    it('replaces a matched line in place rather than moving it to the end', async () => {
        // Line order is the draft order's display order, so a replacement must
        // keep its position. The two tests above cannot tell in-place from
        // append, because the line they match happens to be last already.
        const suppliedProduct = new SuppliedProduct('99');
        const catalogItem = new CatalogItem('99/CatalogItem', { references: [suppliedProduct] });
        const offer = new Offer('99/Offer', { offers: [catalogItem] });
        const updatedFirstLine = new OrderLine(
            'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
            { quantity: 42, concerns: [offer] }
        );

        expect(await createUpdatedShopifyLines(draftOrder, updatedFirstLine)).toStrictEqual([
            {variantId: "gid://shopify/ProductVariant/99", quantity: 42},
            {variantId: "gid://shopify/ProductVariant/100", quantity: 6},
        ]);
    });

    it('Will merge existing lines with an updated dfc line (matched on variant) to produce the shopify order line input shape', async () => {
        const updatedSuppliedProduct = new SuppliedProduct('100');
        const updatedCatalogItem = new CatalogItem('100/CatalogItem', { references: [updatedSuppliedProduct] });
        const updatedOffer = new Offer('100/Offer', { offers: [updatedCatalogItem] });
        const updatedDfcLine = new OrderLine(
            'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
            { quantity: 7, concerns: [updatedOffer] }
        );

        expect(await createUpdatedShopifyLines(draftOrder, updatedDfcLine)).toStrictEqual([
            {variantId: "gid://shopify/ProductVariant/99", quantity: 5},
            {variantId: "gid://shopify/ProductVariant/100", quantity: 7},
        ]);
    });

    it('resolves the product through an unresolved CatalogItem id', async () => {
        // When the connector hands back ids rather than resolved objects the
        // CatalogItem is still recognisable by its `/CatalogItem` suffix.
        const newDfcLine = new OrderLine(
            'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
            {
                quantity: 7,
                concerns: [new Offer('o', { offers: ['777/CatalogItem'] })]
            }
        );

        const lines = await createUpdatedShopifyLines(draftOrder, newDfcLine);

        expect(lines).toContainEqual({
            variantId: 'gid://shopify/ProductVariant/777',
            quantity: 7
        });
    });

    describe('unresolvable product chain', () => {
        // An OrderLine whose Offer -> CatalogItem -> SuppliedProduct chain does
        // not resolve used to fall back to the order line's own @id, which
        // `ids.extract` reduces to the *external line id* — producing a variant
        // id like `gid://shopify/ProductVariant/10001-01`. That silently
        // appended a duplicate line instead of replacing one. It must fail
        // loudly instead.

        const unresolvedLine = () => new OrderLine(
            'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
            { quantity: 7, concerns: [new Offer('o', { offers: [] })] }
        );

        it('returns null from suppliedProductIdFor', () => {
            expect(suppliedProductIdFor(unresolvedLine())).toBeNull();
        });

        it('returns null when there is no Offer at all', () => {
            const noOffer = new OrderLine(
                'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
                { quantity: 7 }
            );

            expect(suppliedProductIdFor(noOffer)).toBeNull();
        });

        it('requireSuppliedProductId throws a 4xx naming the expected chain', () => {
            expect(() => requireSuppliedProductId(unresolvedLine())).toThrow(
                /OrderLine.*Offer.*CatalogItem.*SuppliedProduct/s
            );

            try {
                requireSuppliedProductId(unresolvedLine());
            } catch (error) {
                expect(error.status).toBe(422);
            }
        });

        it('dfcLineToShopifyLine rejects rather than inventing a variant id', async () => {
            await expect(dfcLineToShopifyLine(unresolvedLine()))
                .rejects.toMatchObject({ status: 422 });
        });

        it('createUpdatedShopifyLines rejects rather than appending a duplicate', async () => {
            // Previously the match test compared a real variant id against
            // '10001-01', never matched, and appended the line.
            await expect(createUpdatedShopifyLines(draftOrder, unresolvedLine()))
                .rejects.toMatchObject({ status: 422 });
        });

        it('never emits a variantId derived from the external line id', async () => {
            // Direct guard against the regression, independent of the error path.
            let emitted;
            try {
                emitted = await dfcLineToShopifyLine(unresolvedLine());
            } catch (error) {
                emitted = error;
            }

            const serialised = JSON.stringify(emitted);
            expect(serialised).not.toContain('ProductVariant/10001-01');
        });
    });

    describe('offer pointing directly at the SuppliedProduct', () => {
        // Some senders (and any pre-v2 payload) put the product straight on
        // `Offer.offers` instead of routing through a CatalogItem. That shape
        // used to work by accident and must keep working deliberately, rather
        // than being mistaken for an unresolvable chain.

        it('resolves the product id when offers is a SuppliedProduct', () => {
            const line = new OrderLine(
                'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
                {
                    quantity: 7,
                    concerns: [new Offer('o', { offers: [new SuppliedProduct('888')] })]
                }
            );

            expect(suppliedProductIdFor(line)).toBe('888');
        });

        it('builds the Shopify line from that product', async () => {
            const line = new OrderLine(
                'http://test.host/api/dfc/Enterprises/10000/Orders/10001/orderlines/10001-01',
                {
                    quantity: 7,
                    concerns: [new Offer('o', { offers: [new SuppliedProduct('888')] })]
                }
            );

            expect(await dfcLineToShopifyLine(line)).toStrictEqual({
                variantId: 'gid://shopify/ProductVariant/888',
                quantity: 7
            });
        });
    });
});