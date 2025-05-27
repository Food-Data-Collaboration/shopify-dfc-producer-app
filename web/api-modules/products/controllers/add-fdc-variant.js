import { addVariant } from '../../../database/variants/variants.js';

const addFdcVariant = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const {
      retailVariantId, wholesaleVariantId, noOfItemsPerPackage, enabled
    } = req.body;
    const { shopName } = req;

    const updatedVariantMapping = await addVariant({
      productId, retailVariantId, wholesaleVariantId, noOfItemsPerPackage, enabled, shopName
    });

    return res.status(200).json(updatedVariantMapping);
  } catch (error) {
    console.error('Error adding variant', error);
    return res.status(500).json({
      error: 'Error adding variant'
    });
  }
};

export default addFdcVariant;
