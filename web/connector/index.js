import { Connector } from '@siol-data/linkml-connector';
import { throwError } from '../utils/index.js';

let _connector;
let connected = false;

export default async () => {
  try {
    if (!connected) {
      // LinkML connector ships bundled v2.0.0 taxonomies, loaded
      // synchronously by the constructor — no thesaurus loading needed.
      // Export @context is always the versioned URL string.
      const connector = new Connector();
      connected = true;
      _connector = connector;
      return _connector;
    }

    return _connector;
  } catch (error) {
    throwError('Error loading connector', error);
  }
};
