const DFC_CONTEXT_W3ID = 'https://w3id.org/dfc/ontology/context/context_1.16.0.json';
const DFC_CONTEXT_PRELOADED = 'https://www.datafoodconsortium.org/wp-content/plugins/wordpress-context-jsonld/context_1.16.0.jsonld';

function normalizeContext(payload) {
  if (typeof payload === 'string') {
    return payload.replaceAll(DFC_CONTEXT_W3ID, DFC_CONTEXT_PRELOADED);
  }
  if (payload && typeof payload === 'object' && payload['@context'] === DFC_CONTEXT_W3ID) {
    return { ...payload, '@context': DFC_CONTEXT_PRELOADED };
  }
  return payload;
}

export { DFC_CONTEXT_W3ID, DFC_CONTEXT_PRELOADED, normalizeContext };
