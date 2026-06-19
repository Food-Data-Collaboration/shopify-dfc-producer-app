import { SuppliedProduct } from
  '@datafoodconsortium/connector';
import {
  createSuppliedProducts,
  createVariantSuppliedProduct,
  exportSuppliedProducts
} from './productUtils';

import {
  createSuppliedProductsInput,
  exportSuppliedProductsJSONLD,
  suppliedProductsWithMappedFdcVariants,
  suppliedProductsWithUnmappedFdcVariants
} from './mocks.js';

describe('createVariantSuppliedProduct', () => {
  it('should create a variant supplied product', async () => {
    const result = await createVariantSuppliedProduct(
      createSuppliedProductsInput[0],
      createSuppliedProductsInput[0].variants[0],
      'producer-shop'
    );

    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(3);
    expect(result[0].getSemanticId()).toBe(
      'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/43305180201112'
    );
    expect(result[0].getName()).toBe('Camelina Seed - Retail pack, 300g');
    expect(result[0].getImages()).toEqual(['https://cdn.shopify.com/s/files/1/0587/9735/9256/products/37-cammalina-fron.jpg?v=1706882031']);

    expect(result[1].getSemanticId()).toBe(
      'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/43305180201112/Offer'
    );
    expect(result[2].getSemanticId()).toBe(
      'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/43305180201112/CatalogItem'
    );

    const [quantity, catalogItems] = await Promise.all([
      result[0].getQuantity(),
      result[0].getCatalogItems()
    ]);

    expect(await quantity.getQuantityValue()).toBe(0.5);
    expect(await quantity.getQuantityUnit()).toBeDefined();

    const catalogItem = catalogItems[0];
    expect(catalogItem.getSku()).toBe('12345');
    expect(catalogItem.getStockLimitation()).toBe(-224);

    const offers = await catalogItem.getOfferers();
    const offer = offers[0];
    const price = await offer.getPrice();
    expect(price.getQuantityValue()).toBe(2.49);
    expect(price.getVatRate()).toBe(1.0);
  });

  it('catalogue will have stock limitation -1 when inventory policy is to continue selling, regardless of inventory quantity', async () => {
    const variantWithContinueSelling = {
      ...createSuppliedProductsInput[0].variants[0],
      inventoryQuantity: 1,
      inventoryPolicy: 'continue'
    };

    const result = await createVariantSuppliedProduct(
      createSuppliedProductsInput[0],
      variantWithContinueSelling,
      'producer-shop'
    );
    const catalogItems = await result[0].getCatalogItems();

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0].getStockLimitation()).toBe(-1);
  });
});

describe('createSuppliedProducts', () => {
  it('should create mapped suppliedProducts from shopify Products and their Variants', async () => {
    const semanticIdParent = `http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/${suppliedProductsWithMappedFdcVariants[0].id}`;
    const semanticIdProductOne = `http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/${suppliedProductsWithMappedFdcVariants[0].variants[0].id}`;
    const semanticIdProductTwo = `http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/${suppliedProductsWithMappedFdcVariants[0].variants[1].id}`;

    const result = await createSuppliedProducts(
      suppliedProductsWithMappedFdcVariants,
      'producer-shop'
    );

    expect(result).toBeInstanceOf(Array);

    expect(result[0].getSemanticId()).toBe(semanticIdParent);
    expect(result[0].getName()).toBe('Baked British Beans');

    expect(result[1].getSemanticId()).toBe(semanticIdProductOne);
    expect(result[1].getName()).toBe(
      'Baked British Beans - Retail bottle, 40ml'
    );
    expect(result[1].getDescription()).toBe('Testing this product HTML');

    expect(result[1].getImages()).toEqual([
      'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031'
    ]);

    expect(result[2].getSemanticId()).toBe(semanticIdProductTwo);

    expect(result[6].getSemanticId()).toBe(`${semanticIdProductOne}/Offer`);
    expect(result[7].getSemanticId()).toBe(
      `${semanticIdProductOne}/CatalogItem`
    );
    expect(result[8].getSemanticId()).toBe(`${semanticIdProductTwo}/Offer`);
    expect(result[9].getSemanticId()).toBe(
      `${semanticIdProductTwo}/CatalogItem`
    );

    expect(result[3].getSemanticId()).toBe(
      `${semanticIdProductOne}/AsPlannedConsumptionFlow`
    );
    expect(result[4].getSemanticId()).toBe(
      `${semanticIdProductOne}/AsPlannedProductionFlow`
    );
    expect(result[5].getSemanticId()).toBe(
      `${semanticIdProductOne}/AsPlannedTransformation`
    );
  });

  it('should create unmapped suppliedProducts from shopify Products and their Variants', async () => {
    const result = await createSuppliedProducts(
      suppliedProductsWithUnmappedFdcVariants,
      'producer-shop'
    );

    const suppliedProducts = result.filter((item) => item instanceof SuppliedProduct);

    expect(suppliedProducts).toHaveLength(3);

    expect(suppliedProducts[0].getSemanticId()).toBe('http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/9932577997073');
    expect(suppliedProducts[0].getName()).toBe('Baked British Beans');

    expect(suppliedProducts[1].getSemanticId()).toBe('http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/49889697366289');
    expect(suppliedProducts[1].getName()).toBe('Baked British Beans - Retail bottle, 40ml');

    expect(suppliedProducts[2].getSemanticId()).toBe('http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/49889697399057');
    expect(suppliedProducts[2].getName()).toBe('Baked British Beans - Case, 6 x 40ml');
  });
});

describe('exportSuppliedProducts', () => {
  it('should export the created suppliedProducts, catalogItems, Offers etc. as JSON-LD', async () => {
    const result = await exportSuppliedProducts(
      suppliedProductsWithMappedFdcVariants,
      'fdc-producer'
    );
    expect(result).toEqual(exportSuppliedProductsJSONLD);
  });
});
