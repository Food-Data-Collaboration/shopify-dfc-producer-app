export const suppliedProductsWithMappedFdcVariants = [
  {
    id: '9932577997073',
    title: 'Baked British Beans',
    description: 'Testing this product',
    descriptionHtml: 'Testing this product HTML',
    handle: 'baked-british-beans',
    status: 'ACTIVE',
    images: [
      {
        id: '44001459765400',
        altText: 'Baked British Beans',
        src: 'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031'
      }
    ],

    variants: [
      {
        id: '49889697366289',
        title: 'Retail bottle, 40ml',
        image: {
          id: '44001459765400',
          altText: 'Baked British Beans',
          src: 'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031'
        }
      },
      {
        id: '49889697399057',
        title: 'Case, 6 x 40ml',
        image: null
      },
      {
        id: '49889697431825',
        title: 'Retail bottle, 100ml',
        image: null
      },
      {
        id: '49889697464593',
        title: 'Small case, 6 x 100ml',
        image: null
      }
    ],
    fdcVariants: [
      {
        id: 1,
        wholesaleVariantId: '49889697399057',
        retailVariantId: '49889697366289',
        productId: '9932577800465',
        noOfItemsPerPackage: 6
      },
    ]
  }
];

export const suppliedProductsWithUnmappedFdcVariants = [
  {
    ...suppliedProductsWithMappedFdcVariants[0],
    fdcVariants: [
      {
        id: 1,
        retailVariantId: '49889697366289',
        productId: '9932577800465',
      },

      {
        id: 2,
        retailVariantId: '49889697399057',
        productId: '9932577800465',
      }
    ]
  }
]

export const createSuppliedProductInput = {
  id: 123,
  handle: 'test-handle',
  image: { id: 456, src: 'test-image-src', product_id: 123 },
  title: 'Test Product',
  descriptionHtml: 'Test description',
  productType: 'Cans'
};

export const createSuppliedProductsInput = [
  {
    id: 7898317750424,
    title: 'Camelina Seed',
    descriptionHtml:
      '<p><strong>Camelina, also known as Gold of Pleasure, has been grown in England for thousands of years for its tasty seeds and oil. Sprinkle on salads, use in baking, add to smoothies, or use as a vegan egg replacement. </strong></p>\n<!-- split --><h3>Complete Product Details</h3><p>Sprinkle on salads, add to smoothies, use in baking.</p>\n<h5 class="product-detail-title">Cooking instructions</h5>\n<p>Soak 1 tablespoon of seeds in 3 tablespoons of warm water for 30 minutes to replace one egg in vegan baking.</p>\n<h5 class="product-detail-title">Ingredients</h5>\n<p>Camelina seeds</p>\n<h5 class="product-detail-title">Allergy information</h5>\n<p>No Allergens</p>\n<table width="100%">\n<tbody>\n<tr>\n<td><strong>Typical values</strong></td>\n<td><strong>Per 100g</strong></td>\n</tr>\n<tr>\n<td>Energy</td>\n<td>1439kJ (346kcal)</td>\n</tr>\n<tr>\n<td>Fat</td>\n<td>12.1g</td>\n</tr>\n<tr>\n<td>of which saturates</td>\n<td>1.7g</td>\n</tr>\n<tr>\n<td>Carbohydrate</td>\n<td>16.4g</td>\n</tr>\n<tr>\n<td>of which sugars</td>\n<td>1.2g</td>\n</tr>\n<tr>\n<td>Fibre</td>\n<td>35.1g</td>\n</tr>\n<tr>\n<td>Protein</td>\n<td>25.4g</td>\n</tr>\n<tr>\n<td>Salt</td>\n<td>0g</td>\n</tr>\n</tbody>\n</table><p>Camelina Seeds are high in protein, a good source of Omega 3 oils and rich in antioxidants such as vitamin E</p><h5 class="product-detail-title">More</h5>\n<p>Grown by Peter Fairs in Essex and Andy Howard in Kent.</p>',
    vendor: 'hassanstroe',
    productType: '',
    created_at: '2024-02-02T15:53:51+02:00',
    handle: 'camelina-seed-trade',
    updated_at: '2024-02-02T16:48:22+02:00',
    published_at: '2024-02-02T15:53:51+02:00',
    template_suffix: null,
    published_scope: 'web',
    status: 'active',
    admin_graphql_api_id: 'gid://shopify/Product/7898317750424',
    variants: [
      {
        id: 43305180201112,
        product_id: 7898317750424,
        title: 'Retail pack, 300g',
        price: '2.49',
        sku: '12345',
        position: 1,
        inventoryPolicy: 'deny',
        compare_at_price: null,
        fulfillmentService: 'manual',
        inventoryManagement: 'shopify',
        option1: 'Retail pack, 300g',
        option2: null,
        option3: null,
        created_at: '2024-02-02T15:53:51+02:00',
        updated_at: '2024-02-02T15:53:52+02:00',
        taxable: true,
        barcode: null,
        grams: 0,
        image: {
          id: 44001459798168,
          altText: 'Retail pack, 300g',
          src: 'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/37-cammalina-fron.jpg?v=1706882031',
        },
        weight: 0.5,
        weight_unit: 'kg',
        inventory_item_id: 45401870631064,
        inventoryQuantity: -224,
        oldInventoryQuantity: -224,
        requires_shipping: true,
        admin_graphql_api_id: 'gid://shopify/ProductVariant/43305180201112'
      }
    ],
    options: [
      {
        id: 10028906512536,
        product_id: 7898317750424,
        name: 'Title',
        position: 1,
        values: ['Retail pack, 300g']
      }
    ],
    images: [
      {
        id: 44001459765400,
        altText: 'Camelina Seed',
        position: 1,
        product_id: 7898317750424,
        created_at: '2024-02-02T15:53:51+02:00',
        updated_at: '2024-02-02T15:53:51+02:00',
        admin_graphql_api_id: 'gid://shopify/ProductImage/44001459765400',
        width: 1800,
        height: 1200,
        src: 'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031',
        variant_ids: []
      },
      {
        id: 44001459798168,
        altText: 'Retail pack, 300g',
        position: 2,
        product_id: 7898317750424,
        created_at: '2024-02-02T15:53:51+02:00',
        updated_at: '2024-02-02T15:53:51+02:00',
        admin_graphql_api_id: 'gid://shopify/ProductImage/44001459798168',
        width: 1200,
        height: 800,
        src: 'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/37-cammalina-fron.jpg?v=1706882031',
        variant_ids: [43305180201112]
      }
    ],
    image: {
      id: 44001459765400,
      altText: 'Camelina Seed',
      position: 1,
      product_id: 7898317750424,
      created_at: '2024-02-02T15:53:51+02:00',
      updated_at: '2024-02-02T15:53:51+02:00',
      admin_graphql_api_id: 'gid://shopify/ProductImage/44001459765400',
      width: 1800,
      height: 1200,
      src: 'https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031',
      variant_ids: []
    }
  }
];

export const exportSuppliedProductsJSONLD = `{\"@context\":\"https://w3id.org/dfc/ontology/context/context_1.16.0.json\",\"@graph\":[{\"@id\":\"_:b17\",\"@type\":\"dfc-b:QuantitativeValue\",\"dfc-b:hasUnit\":\"dfc-m:Kilogram\"},{\"@id\":\"_:b18\",\"@type\":\"dfc-b:Price\",\"dfc-b:VATrate\":\"0\",\"dfc-b:hasUnit\":\"dfc-m:Euro\"},{\"@id\":\"_:b19\",\"@type\":\"dfc-b:QuantitativeValue\",\"dfc-b:hasUnit\":\"dfc-m:Kilogram\"},{\"@id\":\"_:b20\",\"@type\":\"dfc-b:Price\",\"dfc-b:VATrate\":\"0\",\"dfc-b:hasUnit\":\"dfc-m:Euro\"},{\"@id\":\"_:b21\",\"@type\":\"dfc-b:QuantitativeValue\",\"dfc-b:hasUnit\":\"dfc-m:Piece\",\"dfc-b:value\":\"6\"},{\"@id\":\"_:b22\",\"@type\":\"dfc-b:QuantitativeValue\",\"dfc-b:hasUnit\":\"dfc-m:Piece\",\"dfc-b:value\":\"1\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289\",\"@type\":\"dfc-b:SuppliedProduct\",\"dfc-b:description\":\"Testing this product HTML\",\"dfc-b:hasQuantity\":\"_:b17\",\"dfc-b:image\":\"https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031\",\"dfc-b:name\":\"Baked British Beans - Retail bottle, 40ml\",\"dfc-b:referencedBy\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/CatalogItem\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/AsPlannedConsumptionFlow\",\"@type\":\"dfc-b:AsPlannedConsumptionFlow\",\"dfc-b:consumes\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289\",\"dfc-b:hasQuantity\":\"_:b21\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/AsPlannedProductionFlow\",\"@type\":\"dfc-b:AsPlannedProductionFlow\",\"dfc-b:hasQuantity\":\"_:b22\",\"dfc-b:produces\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697399057\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/AsPlannedTransformation\",\"@type\":\"dfc-b:AsPlannedTransformation\",\"dfc-b:hasIncome\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/AsPlannedConsumptionFlow\",\"dfc-b:hasOutcome\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/AsPlannedProductionFlow\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/CatalogItem\",\"@type\":\"dfc-b:CatalogItem\",\"dfc-b:offeredThrough\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/Offer\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697366289/Offer\",\"@type\":\"dfc-b:Offer\",\"dfc-b:hasPrice\":{\"@id\":\"_:b18\"}},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697399057\",\"@type\":\"dfc-b:SuppliedProduct\",\"dfc-b:description\":\"Testing this product HTML\",\"dfc-b:hasQuantity\":\"_:b19\",\"dfc-b:image\":\"https://cdn.shopify.com/s/files/1/0587/9735/9256/products/Cameilna-Seeds-1800x1200_8c00a108-d8f7-4920-9bac-758a2c6a8b56.jpg?v=1706882031\",\"dfc-b:name\":\"Baked British Beans - Case, 6 x 40ml\",\"dfc-b:referencedBy\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697399057/CatalogItem\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697399057/CatalogItem\",\"@type\":\"dfc-b:CatalogItem\",\"dfc-b:offeredThrough\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697399057/Offer\"},{\"@id\":\"http://localhost:3629/api/dfc/Enterprises/fdc-producer/SuppliedProducts/49889697399057/Offer\",\"@type\":\"dfc-b:Offer\",\"dfc-b:hasPrice\":{\"@id\":\"_:b20\"}}]}`;
