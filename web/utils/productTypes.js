import productTypesJson from '../connector/thesaurus/productTypes.json' with { type: 'json' };


export const parseProductTypesFromJson = () => {
  const concepts = [];
  const topConcepts = [];
  const idToConceptMap = new Map();

  // Parse the graph
  if (productTypesJson && productTypesJson[0] && productTypesJson[0]['@graph']) {
    const graph = productTypesJson[0]['@graph'];

    // Find the ontology node
    const ontologyNode = graph.find((node) =>
      node['@type'] &&
      node['@type'].some((type) => type.includes('owl#Ontology')) &&
      Object.keys(node).some((key) => key.includes('skos/core#hasTopConcept')));

    const hasTopConceptKey = Object.keys(ontologyNode || {}).find((key) => key.includes('skos/core#hasTopConcept'));

    if (hasTopConceptKey) {
      // Extract top concept IDs
      const topConceptsRefs = ontologyNode[hasTopConceptKey];
      for (const ref of topConceptsRefs) {
        if (ref['@id']) {
          const id = extractConceptId(ref['@id']);
          topConcepts.push(id);
        }
      }
    }

    // Process all nodes
    for (const node of graph) {
      // Check for product type nodes:
      // 1. Check if it's a node with productTypes.rdf# in the ID (actual product type)
      const isProductTypeNode = node['@id'] && node['@id'].includes('productTypes.rdf#');

      // 2. Check if it has relevant SKOS properties that indicate it's a concept
      const hasSkosProperties = Object.keys(node).some((key) =>
        key.includes('skos/core#prefLabel') ||
        key.includes('skos/core#broader') ||
        key.includes('skos/core#narrower'));

      if (isProductTypeNode && hasSkosProperties) {
        const id = extractConceptId(node['@id']);

        // Get preferred label in English
        let label = id; // Default to ID

        const prefLabelKey = Object.keys(node).find((key) => key.includes('skos/core#prefLabel'));

        if (prefLabelKey) {
          const labels = node[prefLabelKey];
          const engLabel = labels.find((l) => l['@language'] === 'en');
          if (engLabel && engLabel['@value']) {
            label = engLabel['@value'];
          }
        }

        // Find parent concept (broader)
        let parentId = null;
        const broaderKey = Object.keys(node).find((key) => key.includes('skos/core#broader'));
        if (broaderKey) {
          const broaderRefs = node[broaderKey];
          if (broaderRefs.length > 0 && broaderRefs[0]['@id']) {
            parentId = extractConceptId(broaderRefs[0]['@id']);
          }
        }

        const concept = {
          id,
          label,
          parentId,
          children: []
        };

        concepts.push(concept);
        idToConceptMap.set(id, concept);
      }
    }
  }

  // Build parent-child relationships
  for (const concept of concepts) {
    if (concept.parentId) {
      const parent = idToConceptMap.get(concept.parentId);
      if (parent) {
        parent.children.push(concept.id);
      }
    }
  }

  return {
    productTypes: concepts,
    topLevelProductTypes: topConcepts
  };
};

export const extractConceptId = (url) => {
  if (!url) {
    return '';
  }
  const parts = url.split('#');
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }
  return url;
};

export const fetchProductTypeById = (typeId) => {
  if (!productTypesJson || !productTypesJson[0] || !productTypesJson[0]['@graph']) {
    return null;
  }

  const graph = productTypesJson[0]['@graph'];

  const matchingNode = graph.find((node) => {
    if (node['@id'] && node['@id'].includes('productTypes.rdf#')) {
      const extractedId = extractConceptId(node['@id']);
      return extractedId === typeId;
    }
    return false;
  });

  if (!matchingNode) {
    return null;
  }

  const id = matchingNode['@id'];

  let label = id;
  const prefLabelKey = Object.keys(matchingNode).find((key) => key.includes('skos/core#prefLabel'));
  if (prefLabelKey) {
    const labels = matchingNode[prefLabelKey];
    const engLabel = labels.find((l) => l['@language'] === 'en');
    if (engLabel && engLabel['@value']) {
      label = engLabel['@value'];
    }
  }

  return { id, label };
};
