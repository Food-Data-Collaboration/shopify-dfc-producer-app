import { toggleVariantMappingStatus, setAllVariantMappingStatuses } from '../../../database/variants/variants.js';

export const toggleFdcVariantStatus = async (req, res) => {
  try {
    const { variantId } = req.params;

    const updatedVariantMapping = await toggleVariantMappingStatus(variantId);

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

    const updatedVariantMapping = await setAllVariantMappingStatuses(id, variants, enabled);

    return res.status(200).json(updatedVariantMapping);
  } catch (error) {
    console.error('Error updating product', error);
    return res.status(500).json({
      error: 'Error updating product'
    });
  }
};
