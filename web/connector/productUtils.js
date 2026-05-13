import { SuppliedProduct, Concept } from '@fooddatacollaboration/linkml-connector';
import config from '../config.js';
import currencyMeasureFor from '../utils/currencyMeasureFor.js';
import { throwError } from '../utils/index.js';
import { fetchProductTypeById } from '../utils/productTypes.js';
import loadConnectorWithResources from './index.js';

let _qtyCounter = 0;
const nextQtyId = () => `_:qty_${++_qtyCounter}`;

const createQuantitativeValue = (connector, value, unit) =>
  connector.createQuantitativeValue(nextQtyId(), { value, hasUnit: unit });

const createPrice = (connector, vatRate) =>
  connector.createPrice(`_:price_${++_qtyCounter}`, { vatRate });

const createOffer = (connector, semanticId, price) =>
  connector.createOffer(`${semanticId}/Offer`, { hasPrice: price.semanticId });

const createCatalogItem = (connector, semanticId, offers, sku, stockLimitation) =>
  connector.createCatalogItem(`${semanticId}/CatalogItem`, {
    sku,
    stockLimitation,
    offeredThrough: offers.map((o) => o.semanticId),
  });

async function createVariantSuppliedProduct(
  parentProduct,
  variant,
  enterpriseName,
  shopDefaultProductType
) {
  try {
    const connector = await loadConnectorWithResources();
    const kilogram = 'dfc-m:Kilogram';

    const semanticBase = `${config.HOST}api/dfc/Enterprises/${enterpriseName}/SuppliedProducts/${variant.id}`;

    const quantity = createQuantitativeValue(
      connector,
      variant?.weight || 0,
      kilogram
    );
    const hasVat = variant.taxable ? 1.0 : 0.0;
    const price = createPrice(connector, hasVat);
    const offer = createOffer(connector, semanticBase, price);
    const inventoryQuantity =
      variant.inventoryPolicy === 'CONTINUE' ? -1 : variant.inventoryQuantity;
    const catalogItem = createCatalogItem(
      connector,
      semanticBase,
      [offer],
      variant.sku,
      inventoryQuantity
    );

    const productType = fetchProductTypeById(shopDefaultProductType);

    const suppliedProduct = connector.createSuppliedProduct(semanticBase, {
      name: `${parentProduct.title} - ${variant.title}`,
      description: parentProduct.descriptionHtml,
      hasQuantity: quantity,
      hasType: productType ? productType.id : undefined,
    });

    const image = variant.image?.src || parentProduct.images[0]?.src;

    if (image) {
      suppliedProduct.image = image;
    }

    return [suppliedProduct, offer, catalogItem, price, quantity];
  } catch (error) {
    throwError('Error creating variant supplied product:', error);
  }
  return null;
}

async function createMappedVariant(
  shopifyProduct,
  retailVariant,
  wholesaleVariant,
  noOfItemsPerPackage,
  enterpriseName,
  shopDefaultProductType
) {
  const [retailSuppliedProduct, ...retailOthers] =
    await createVariantSuppliedProduct(
      shopifyProduct,
      retailVariant,
      enterpriseName,
      shopDefaultProductType
    );
  const [wholesaleSuppliedProduct, ...wholesaleOthers] =
    await createVariantSuppliedProduct(
      shopifyProduct,
      wholesaleVariant,
      enterpriseName,
      shopDefaultProductType
    );

  const connector = await loadConnectorWithResources();

  const semanticBase = `${config.HOST}api/dfc/Enterprises/${enterpriseName}/SuppliedProducts/${retailVariant.id}`;

  const piece = 'dfc-m:Piece';

  const consumptionQty = createQuantitativeValue(
    connector,
    noOfItemsPerPackage,
    piece
  );
  const productionQty = createQuantitativeValue(connector, 1.0, piece);

  const plannedConsumptionFlow = connector.createAsPlannedConsumptionFlow(
    `${semanticBase}/AsPlannedConsumptionFlow`,
    {
      hasQuantity: consumptionQty,
      consumes: retailSuppliedProduct.semanticId,
    }
  );

  const plannedProductionFlow = connector.createAsPlannedProductionFlow(
    `${semanticBase}/AsPlannedProductionFlow`,
    {
      hasQuantity: productionQty,
      produces: wholesaleSuppliedProduct.semanticId,
    }
  );

  const plannedTransformation = connector.createAsPlannedTransformation(
    `${semanticBase}/AsPlannedTransformation`,
    {
      hasInput: [plannedConsumptionFlow.semanticId],
      hasOutput: [plannedProductionFlow.semanticId],
      hasTransformationType: 'dfc-v:Combine',
    }
  );

  return [
    retailSuppliedProduct,
    wholesaleSuppliedProduct,
    plannedConsumptionFlow,
    plannedProductionFlow,
    plannedTransformation,
    ...retailOthers,
    ...wholesaleOthers,
    consumptionQty,
    productionQty,
  ];
}

const createVariants = async (
  shopifyProduct,
  variantMapping,
  enterpriseName,
  shopDefaultProductType
) => {
  const { wholesaleVariantId, retailVariantId, noOfItemsPerPackage } =
    variantMapping;

  const retailVariant = shopifyProduct.variants.find(
    ({ id }) => id === retailVariantId
  );

  if (!retailVariant) {
    console.error(
      `Variant mapping for Product ${shopifyProduct.id} for retail variant ${retailVariantId} is invalid. Contains non existant variant. Skipping`
    );
    return [];
  }

  if (wholesaleVariantId) {
    const wholesaleVariant = shopifyProduct.variants.find(
      ({ id }) => id === wholesaleVariantId
    );
    return createMappedVariant(
      shopifyProduct,
      retailVariant,
      wholesaleVariant,
      noOfItemsPerPackage,
      enterpriseName,
      shopDefaultProductType
    );
  }
  return createVariantSuppliedProduct(
    shopifyProduct,
    retailVariant,
    enterpriseName,
    shopDefaultProductType
  );
};

const createParent = async (product, enterpriseName, shopDefaultProductType) => {
  const connector = await loadConnectorWithResources();
  const semanticBase = `${config.HOST}api/dfc/Enterprises/${enterpriseName}/SuppliedProducts/${product.id}`;

  const productType = fetchProductTypeById(shopDefaultProductType);

  return connector.createSuppliedProduct(semanticBase, {
    name: product.title,
    description: product.descriptionHtml,
    hasType: productType ? productType.id : undefined,
  });
};

async function createSuppliedProducts(productsFromShopify, enterpriseName, shopDefaultProductType) {
  try {
    if (
      !Array.isArray(productsFromShopify) ||
      productsFromShopify.length === 0
    ) {
      throwError('Error creating supplied products: no products found');
    }

    const productsPromises = productsFromShopify.map(async (product) => {
      const variantsGraph = (
        await Promise.all(
          product.fdcVariants
            .filter(({ enabled }) => enabled)
            .flatMap(async (variant) =>
              createVariants(
                product,
                variant,
                enterpriseName,
                shopDefaultProductType
              ))
        )
      ).flat();

      const variants = variantsGraph.filter((item) => item instanceof SuppliedProduct);

      if (variants.length === 0) {
        return [];
      }

      const parent = await createParent(product, enterpriseName, shopDefaultProductType);
      parent.hasVariant = variants[0].semanticId;
      variants.forEach((variant) => {
        variant.isVariantOf = parent.semanticId;
      });
      return [parent, ...variantsGraph];
    });
    return (await Promise.all(productsPromises)).flat(2);
  } catch (error) {
    return throwError('Error creating supplied products:', error);
  }
}

async function exportSuppliedProducts(productsFromShopify, enterpriseName, shopDefaultProductType) {
  try {
    if (
      !Array.isArray(productsFromShopify) ||
      productsFromShopify.length === 0
    ) {
      return [];
    }

    const connector = await loadConnectorWithResources();

    const suppliedDFCProducts = await createSuppliedProducts(
      productsFromShopify,
      enterpriseName,
      shopDefaultProductType
    );

    if (suppliedDFCProducts.length === 0) {
      return [];
    }

    const exports = await connector.export(...suppliedDFCProducts);
    return JSON.stringify(exports);
  } catch (error) {
    console.error(error);
    throwError('Error exporting supplied products:', error);
  }
  return null;
}

export {
  createSuppliedProducts,
  createVariantSuppliedProduct,
  exportSuppliedProducts,
};
