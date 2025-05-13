import { Router } from 'express';
import getShopDetails from './get-shop-details.js';
import completeSetup from './complete-setup.js';
import getProductTypes from './get-product-types.js';

const shop = Router();

shop.get('/details', getShopDetails);
shop.post('/complete-setup', completeSetup);
shop.get('/product-types', getProductTypes);

export default shop;
