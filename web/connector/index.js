import {Connector} from '@datafoodconsortium/connector';
import facets from './thesaurus/facets.json' with { type: 'json' };
import measures from './thesaurus/measures.json' with { type: 'json' };
import productTypes from './thesaurus/productTypes.json' with { type: 'json' };
import vocabulary from './thesaurus/vocabulary.json' with { type: 'json' };
import { DFC_CONTEXT_W3ID } from './dfcContext.js';
import { throwError } from '../utils/index.js';

let _connector;
let connected = false;

export default async () => {
  try {
    if (!connected) {
      const connector = new Connector();
      const resourcePromisesArray = [
        connector.loadFacets(JSON.stringify(facets)),
        connector.loadMeasures(JSON.stringify(measures)),
        connector.loadProductTypes(JSON.stringify(productTypes)),
        connector.loadVocabulary(JSON.stringify(vocabulary))
      ];
      await Promise.all(resourcePromisesArray);

      connector.exporter.outputContext = DFC_CONTEXT_W3ID;

      connected = true;
      _connector = connector;
      return _connector;
    }

    return _connector;
  } catch (error) {
    throwError('Error loading connector', error);
  }
};
