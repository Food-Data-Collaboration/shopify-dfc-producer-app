import loadConnectorWithResources from '../connector/index.js';

// Product types now come from the LinkML connector's bundled v2.0.0 taxonomy
// (replacing the deleted v1 thesaurus JSON). Concept ids are v2 notations
// (e.g. 'Drink'); ids stored by shops onboarding under v1 may not resolve.

const broaderId = (ref) => {
  if (!ref) {
    return null;
  }
  const id = typeof ref === 'string' ? ref : ref['@id'];
  if (!id) {
    return null;
  }
  const parts = id.split(':');
  return parts[parts.length - 1];
};

const broaderRefsOf = (node) => {
  const broader = node['skos:broader'];
  if (!broader) {
    return [];
  }
  return Array.isArray(broader) ? broader : [broader];
};

const englishLabel = (node, fallback) => {
  const labels = node['skos:prefLabel'];
  if (!labels) {
    return fallback;
  }
  const list = Array.isArray(labels) ? labels : [labels];
  const eng = list.find((l) => l['@language'] === 'en');
  return (eng && eng['@value']) || fallback;
};

export const parseProductTypesFromJson = async () => {
  const connector = await loadConnectorWithResources();
  const taxonomy = connector.vocabLoader.vocabulary('ProductType');

  const concepts = [];
  const idToConceptMap = new Map();

  Object.entries(taxonomy).forEach(([notation, node]) => {
    const broaderRefs = broaderRefsOf(node);
    const concept = {
      id: notation,
      label: englishLabel(node, notation),
      parentId: broaderRefs.length > 0 ? broaderId(broaderRefs[0]) : null,
      children: []
    };
    concepts.push(concept);
    idToConceptMap.set(notation, concept);
  });

  const topConcepts = [];
  concepts.forEach((concept) => {
    if (concept.parentId) {
      const parent = idToConceptMap.get(concept.parentId);
      if (parent) {
        parent.children.push(concept.id);
      }
    } else {
      topConcepts.push(concept.id);
    }
  });

  return {
    productTypes: concepts,
    topLevelProductTypes: topConcepts
  };
};

export const extractConceptId = (url) => {
  if (!url) {
    return '';
  }
  const hashParts = url.split('#');
  if (hashParts.length > 1) {
    return hashParts[hashParts.length - 1];
  }
  const colonParts = url.split(':');
  return colonParts[colonParts.length - 1];
};

export const fetchProductTypeById = async (typeId) => {
  if (!typeId) {
    return null;
  }
  const connector = await loadConnectorWithResources();
  const taxonomy = connector.vocabLoader.vocabulary('ProductType');

  const wanted = extractConceptId(typeId);
  const node = taxonomy[wanted];
  if (!node) {
    return null;
  }

  return { id: node['@id'], label: englishLabel(node, wanted) };
};
