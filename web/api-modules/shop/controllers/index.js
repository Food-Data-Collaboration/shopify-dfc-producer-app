import { Router } from 'express';
import getShopDetails from './get-shop-details.js';
import completeSetup from './complete-setup.js';

const shop = Router();

shop.get('/details', getShopDetails);
shop.post('/complete-setup', completeSetup);

export default shop;
