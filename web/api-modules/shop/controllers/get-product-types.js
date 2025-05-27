import { parseProductTypesFromJson } from '../../../utils/productTypes.js';

export default async function getProductTypes(req, res) {
  try {
    const parsedProductTypes = parseProductTypesFromJson();

    res.json(parsedProductTypes);
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while retrieving product types',
      error: error.message
    });
  }
}
