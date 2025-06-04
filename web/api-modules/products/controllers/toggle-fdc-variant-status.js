import {
  toggleVariantMappingStatus,
  setAllVariantMappingStatuses,
  bulkSetVariantMappingStatuses
} from '../../../database/variants/variants.js';

export const toggleFdcVariantStatus = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { shopName } = req;

    const updatedVariantMapping = await toggleVariantMappingStatus(
      variantId,
      shopName
    );

    return res.status(200).json(updatedVariantMapping);
  } catch (error) {
    console.error('Error updating product', error);
    return res.status(500).json({
      error: 'Error updating product'
    });
  }
};

export const changeFdcStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, variants } = req.body;
    const { shopName } = req;

    const updatedVariantMapping = await setAllVariantMappingStatuses(
      id,
      variants,
      enabled,
      shopName
    );

    return res.status(200).json(updatedVariantMapping);
  } catch (error) {
    console.error('Error updating product', error);
    return res.status(500).json({
      error: 'Error updating product'
    });
  }
};

export const bulkChangeFdcStatus = async (req, res) => {
  try {
    const { productVariantsMap, enabled } = req.body;
    const { shopName } = req;

    if (!productVariantsMap || Object.keys(productVariantsMap).length === 0) {
      return res.status(400).json({
        error: 'Product IDs with variants are required'
      });
    }

    const updatedVariants = await bulkSetVariantMappingStatuses(
      productVariantsMap,
      enabled,
      shopName
    );

    const groupedByProduct = {};
    updatedVariants.forEach((variant) => {
      const productId = String(variant.productId);

      if (!groupedByProduct[productId]) {
        groupedByProduct[productId] = [];
      }
      groupedByProduct[productId].push(variant);
    });

    return res.status(200).json(groupedByProduct);
  } catch (error) {
    console.error('Error bulk updating products', error);
    return res.status(500).json({
      error: 'Error bulk updating products'
    });
  }
};
