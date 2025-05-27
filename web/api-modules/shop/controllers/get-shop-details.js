import { fetchShopDetails } from '../../../database/shop_registry/shops.js';

const getShopDetails = async (req, res, next) => {
  try {
    const { shopName } = req;

    const shopDetails = await fetchShopDetails(shopName);

    if (!shopDetails) {
      return res.status(404).json({
        error: 'Shop not found'
      });
    }

    return res.json({
      shop: shopDetails
    });
  } catch (err) {
    return next(err);
  }
};

export default getShopDetails;
