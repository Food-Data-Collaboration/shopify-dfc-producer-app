import { deleteVariant } from '../../../database/variants/variants.js';

const addFdcVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { shopName } = req;

    await deleteVariant(variantId, shopName);

    return res.status(200).json(null);
  } catch (error) {
    console.error('Error updating product', error);
    return res.status(500).json({
      error: 'Error updating product'
    });
  }
};

export default addFdcVariant;
