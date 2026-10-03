import { CatalogItem, Offer, OrderLine, SuppliedProduct } from '@siol-data/linkml-connector';
import loadConnectorWithResources from '../../../../connector/index.js';
import {createUpdatedShopifyLines} from './orders.js'

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
});