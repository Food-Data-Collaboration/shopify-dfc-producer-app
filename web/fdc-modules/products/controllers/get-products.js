import shopify from '../../../shopify.js';
import getSession from '../../../utils/getShopifySession.js';
import createDFCProductsFromShopify from '../dfc/dfc-products.js';
import { findFDCProducts, getFdcVariantsFromDB } from './shopify/products.js';

const getProducts = async (req, res) => {
  try {
    const { EnterpriseName } = req.params;

    const session = await getSession(`${EnterpriseName}.myshopify.com`);

    if (!session) {
      return res.status(401).json({ message: 'Unauthorised' });
    }
    const client = new shopify.api.clients.Graphql({ session });

    const fdcVariantsFromDB = await getFdcVariantsFromDB();

    if (Object.keys(fdcVariantsFromDB).length === 0) {
      return res.status(200).json('No products found');
    }

    const fdcProducts = await findFDCProducts(
      client,
      Object.keys(fdcVariantsFromDB)
    );

    const dfcProducts = await createDFCProductsFromShopify(
      fdcProducts,
      fdcVariantsFromDB
    );

    return res.status(200).send(dfcProducts);
  } catch (error) {
    console.error('Unable to load products', error);
    return res.status(500).json({ message: 'Unable to load products' });
  }
};

export default getProducts;
