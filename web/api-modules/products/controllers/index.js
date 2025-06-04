import { Router } from 'express';
import getProducts from './get-products.js';
import { toggleFdcVariantStatus, changeFdcStatus, bulkChangeFdcStatus } from './toggle-fdc-variant-status.js';
import addFdcVariant from './add-fdc-variant.js';
import updateFdcVariant from './update-fdc-variant.js';
import deleteFdcVariant from './delete-fdc-variant.js';

const products = Router();

products.get('/', getProducts);
products.post('/bulk/fdcStatus', bulkChangeFdcStatus); // Must be before the :id route to avoid conflicts
products.post('/:id/fdcStatus', changeFdcStatus);
products.post('/:id/variant/:variantId/toggleFdcStatus', toggleFdcVariantStatus);
products.put('/:id/variant', addFdcVariant);
products.post('/:id/variant/:variantId', updateFdcVariant);
products.delete('/:id/variant/:variantId', deleteFdcVariant);

export default products;
