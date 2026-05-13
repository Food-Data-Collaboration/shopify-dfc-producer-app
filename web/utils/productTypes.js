import productTypesJson from '../connector/thesaurus/productTypes.json' with { type: 'json' };

const buildConceptMap = () => {
  const map = new Map();
  const sources = Array.isArray(productTypesJson) ? productTypesJson : [productTypesJson];
  for (const source of sources) {
    const graph = source['@graph'] || source;
    if (!Array.isArray(graph)) continue;
    for (const node of graph) {
      if (node['@id'] && node['@id'].includes('productTypes.rdf#')) {
        const idParts = node['@id'].split('#');
        const id = idParts[idParts.length - 1];
        let label = id;
        const prefLabelKey = Object.keys(node).find((k) =>
          k.includes('skos/core#prefLabel')
        );
        if (prefLabelKey) {
          const labels = node[prefLabelKey];
          const engLabel = (Array.isArray(labels) ? labels : [labels]).find(
            (l) => l['@language'] === 'en'
          );
          if (engLabel && engLabel['@value']) {
            label = engLabel['@value'];
          }
        }
        map.set(id, { id: node['@id'], label });
      }
    }
  }
  return map;
};

const conceptMap = buildConceptMap();

export const parseProductTypesFromJson = () => {
  const concepts = [];
  const topConcepts = [];
  const idToConceptMap = new Map();

  const sources = Array.isArray(productTypesJson) ? productTypesJson : [productTypesJson];
  for (const source of sources) {
    const graph = source['@graph'] || source;
    if (!Array.isArray(graph)) continue;

    const ontologyNode = graph.find(
      (node) =>
        Array.isArray(node['@type']) &&
        node['@type'].some((t) => t.includes('owl#Ontology'))
    );

    const hasTopConceptKey = Object.keys(ontologyNode || {}).find((key) =>
      key.includes('skos/core#hasTopConcept')
    );

    if (hasTopConceptKey) {
      const topConceptsRefs = ontologyNode[hasTopConceptKey];
      for (const ref of Array.isArray(topConceptsRefs) ? topConceptsRefs : [topConceptsRefs]) {
        if (ref['@id']) {
          const parts = ref['@id'].split('#');
          topConcepts.push(parts[parts.length - 1]);
        }
      }
    }

    for (const node of graph) {
      if (!node['@id'] || !node['@id'].includes('productTypes.rdf#')) continue;

      const hasSkosKeys = Object.keys(node).some(
        (k) =>
          k.includes('skos/core#prefLabel') ||
          k.includes('skos/core#broader') ||
          k.includes('skos/core#narrower')
      );
      if (!hasSkosKeys) continue;

      const parts = node['@id'].split('#');
      const id = parts[parts.length - 1];

      let label = id;
      const prefLabelKey = Object.keys(node).find((k) =>
        k.includes('skos/core#prefLabel')
      );
      if (prefLabelKey) {
        const labels = node[prefLabelKey];
        const engLabel = (Array.isArray(labels) ? labels : [labels]).find(
          (l) => l['@language'] === 'en'
        );
        if (engLabel && engLabel['@value']) {
          label = engLabel['@value'];
        }
      }

      let parentId = null;
      const broaderKey = Object.keys(node).find((k) =>
        k.includes('skos/core#broader')
      );
      if (broaderKey) {
        const broaderRefs = node[broaderKey];
        const firstRef = Array.isArray(broaderRefs) ? broaderRefs[0] : broaderRefs;
        if (firstRef && firstRef['@id']) {
          const bp = firstRef['@id'].split('#');
          parentId = bp[bp.length - 1];
        }
      }

      const concept = { id, label, parentId, children: [] };
      concepts.push(concept);
      idToConceptMap.set(id, concept);
    }
  }

  for (const concept of concepts) {
    if (concept.parentId) {
      const parent = idToConceptMap.get(concept.parentId);
      if (parent) {
        parent.children.push(concept.id);
      }
    }
  }

  return { productTypes: concepts, topLevelProductTypes: topConcepts };
};

export const fetchProductTypeById = (typeId) => {
  const entry = conceptMap.get(typeId);
  return entry || null;
};
