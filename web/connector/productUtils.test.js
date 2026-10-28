import { SuppliedProduct, Offer, CatalogItem, QuantitativeValue, Price } from
  '@siol-data/linkml-connector';
import {
  createSuppliedProducts,
  createVariantSuppliedProduct,
  exportSuppliedProducts
} from './productUtils';

import {
  createSuppliedProductsInput,
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
    expect(result).toHaveLength(5);
    expect(result[0].semanticId).toBe(
      'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/43305180201112'
    );
    expect(result[0].name).toBe('Camelina Seed - Retail pack, 300g');
    expect(result[0].image).toBe('https://cdn.shopify.com/s/files/1/0587/9735/9256/products/37-cammalina-fron.jpg?v=1706882031');

    expect(result[1].semanticId).toBe(
      'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/43305180201112/Offer'
    );
    expect(result[2].semanticId).toBe(
      'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/43305180201112/CatalogItem'
    );

    expect(result[0].hasQuantity.value).toBe(0.5);
    expect(result[0].hasQuantity.hasUnit).toBe('dfc-m:Kilogram');

    expect(result[2].sku).toBe('12345');
    expect(result[2].stockLimitation).toBe(-224);

    expect(result[1].hasPrice).toBe(result[3].semanticId);
    expect(result[3].vatRate).toBe(1.0);
    expect(result[3].value).toBe('2.49');
    expect(result[3].hasUnit).toBe('dfc-m:PoundSterling');
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

    expect(result[2].stockLimitation).toBe(-1);
  });
});

describe('createSuppliedProducts', () => {
  it('should create mapped suppliedProducts from shopify Products and their Variants', async () => {
    const result = await createSuppliedProducts(
      suppliedProductsWithMappedFdcVariants,
      'producer-shop'
    );

    const suppliedProducts = result.filter((item) => item instanceof SuppliedProduct);
    expect(suppliedProducts.length).toBeGreaterThanOrEqual(2);

    const retailSp = suppliedProducts.find(
      (sp) => sp.name === 'Baked British Beans - Retail bottle, 40ml'
    );
    expect(retailSp).toBeDefined();
    expect(retailSp.description).toBe('Testing this product HTML');
    expect(retailSp.image).toBe(
      'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031'
    );

    const wholesaleSp = suppliedProducts.find(
      (sp) => sp.name === 'Baked British Beans - Case, 6 x 40ml'
    );
    expect(wholesaleSp).toBeDefined();

    const offers = result.filter((item) => item instanceof Offer);
    expect(offers.length).toBeGreaterThanOrEqual(2);

    const catalogItems = result.filter((item) => item instanceof CatalogItem);
    expect(catalogItems.length).toBeGreaterThanOrEqual(2);
  });

  it('should create unmapped suppliedProducts from shopify Products and their Variants', async () => {
    const result = await createSuppliedProducts(
      suppliedProductsWithUnmappedFdcVariants,
      'producer-shop'
    );

    const suppliedProducts = result.filter((item) => item instanceof SuppliedProduct);

    expect(suppliedProducts.length).toBeGreaterThanOrEqual(2);

    const productOne = suppliedProducts.find(
      (sp) => sp.semanticId === 'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/49889697366289'
    );
    expect(productOne).toBeDefined();
    expect(productOne.name).toBe('Baked British Beans - Retail bottle, 40ml');

    const productTwo = suppliedProducts.find(
      (sp) => sp.semanticId === 'http://localhost:3629/api/dfc/Enterprises/producer-shop/SuppliedProducts/49889697399057'
    );
    expect(productTwo).toBeDefined();
    expect(productTwo.name).toBe('Baked British Beans - Case, 6 x 40ml');
  });
});

describe('exportSuppliedProducts', () => {
  it('should export the created suppliedProducts, catalogItems, Offers etc. as JSON-LD', async () => {
    const result = await exportSuppliedProducts(
      suppliedProductsWithMappedFdcVariants,
      'fdc-producer'
    );
    expect(result).toEqual(expect.any(String));
    const parsed = JSON.parse(result);
    expect(parsed['@graph'] || parsed['@id']).toBeDefined();
  });
});

describe('blank-node id stability', () => {
  /**
   * A process-wide counter makes the serialised body differ on every rebuild,
   * so a conditional GET can never return 304 and replaying the validator in
   * `If-Match` rejects unchanged data with 412. The ids must come from the
   * variant instead, which makes two reads of unchanged products identical.
   */
  const exportTwice = async () => [
    await exportSuppliedProducts(suppliedProductsWithMappedFdcVariants, 'fdc-producer'),
    await exportSuppliedProducts(suppliedProductsWithMappedFdcVariants, 'fdc-producer')
  ];

  const blankDefinitions = (body) => {
    const graph = JSON.parse(body)['@graph'] || [];
    return graph
      .filter((node) => typeof node?.['@id'] === 'string' && node['@id'].startsWith('_:'))
      .map((node) => node['@id']);
  };

  it('serialises unchanged products to byte-identical output on every read', async () => {
    const [first, second] = await exportTwice();

    expect(typeof first).toBe('string');
    expect(second).toBe(first);

    const ids = blankDefinitions(first);
    // The guard is not vacuous: the export really does emit blank nodes…
    expect(ids.length).toBeGreaterThan(0);
    // …and they are derived from a Shopify variant id, not a run counter.
    expect(ids.every((id) => /_:(?:qty|price)_\d+/.test(id))).toBe(true);
    expect(blankDefinitions(second)).toEqual(ids);
  });

  it('defines each blank node exactly once, so no two nodes collide', async () => {
    const [first] = await exportTwice();
    const ids = blankDefinitions(first);

    expect(new Set(ids).size).toBe(ids.length);
    // The mapped retail/wholesale pair carries two quantities for the same
    // variant; the role suffix is what keeps them apart.
    expect(ids.filter((id) => id.startsWith('_:qty_')).length).toBeGreaterThanOrEqual(4);
    expect(ids.some((id) => id.endsWith('_consumes'))).toBe(true);
    expect(ids.some((id) => id.endsWith('_produces'))).toBe(true);
  });
});
