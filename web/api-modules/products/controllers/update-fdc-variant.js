import { updateVariant } from '../../../database/variants/variants.js';

const updateFdcVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { retailVariantId, wholesaleVariantId, noOfItemsPerPackage } = req.body;
    const { shopName } = req;

    const updatedVariantMapping = await updateVariant(variantId, { retailVariantId, wholesaleVariantId, noOfItemsPerPackage }, shopName);

    return res.status(200).json(updatedVariantMapping);
  } catch (error) {
    console.error('Error updating variant mapping', error);
    return res.status(500).json({
      error: 'Error updating variant mapping'
    });
  }
};

export default updateFdcVariant;
