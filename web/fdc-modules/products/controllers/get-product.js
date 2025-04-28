import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import createDFCProductsFromShopify from '../dfc/dfc-products.js';
import {
  findFDCProducts,
  getFdcVariantsByProductIdFromDB
} from './shopify/products.js';

const getProduct = async (req, res) => {
  try {
    const { EnterpriseName, ProductId } = req.params;
    const { shopName } = req;

    const session = await getSession(`${EnterpriseName}.myshopify.com`);

    if (!session) {
      return res.status(401).json({ message: 'Unauthorised' });
    }

    const client = new shopify.api.clients.Graphql({ session });

    const fdcVariantsFromDB = await getFdcVariantsByProductIdFromDB(ProductId, shopName);

    if (Object.keys(fdcVariantsFromDB).length === 0) {
      return res.status(200).json('No product found');
    }

    const fdcProduct = await findFDCProducts(
      client,
      Object.keys(fdcVariantsFromDB)
    );

    const dfcProducts = await createDFCProductsFromShopify(
      fdcProduct,
      fdcVariantsFromDB
    );

    return res.status(200).send(dfcProducts);
  } catch (error) {
    console.error('Unable to load products', error);
    throw new Error(error);
  }
};

export default getProduct;
