import { Connector } from '@fooddatacollaboration/linkml-connector';
import { throwError } from '../utils/index.js';

let _connector;
let connected = false;

async function loadWithFallback(loader, name) {
  try {
    await loader();
  } catch (error) {
    console.warn(`Failed to load ${name} from URL:`, error.message);
  }
}

export default async () => {
  try {
    if (!connected) {
      const connector = new Connector();
      await Promise.all([
        loadWithFallback(() => connector.loadMeasuresFromUrl(), 'measures'),
        loadWithFallback(() => connector.loadFacetsFromUrl(), 'facets'),
        loadWithFallback(() => connector.loadProductTypesFromUrl(), 'productTypes'),
      ]);
      connected = true;
      _connector = connector;
      return _connector;
    }
    return _connector;
  } catch (error) {
    throwError('Error loading connector', error);
  }
};
