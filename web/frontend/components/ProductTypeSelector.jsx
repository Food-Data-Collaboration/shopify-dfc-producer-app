import {
  Button,
  Card,
  Spinner,
  TextContainer
} from '@shopify/polaris';
import { ChevronDownMinor, ChevronRightMinor } from '@shopify/polaris-icons';
import { useCallback, useEffect, useState } from 'react';
import { useAppQuery } from '../hooks';

export default function ProductTypeSelector({ onChange, value }) {
  const [selectedProductType, setSelectedProductType] = useState(value || null);
  const [expandedItems, setExpandedItems] = useState({});
  const [hierarchicalProductTypes, setHierarchicalProductTypes] = useState([]);

  // Convert into a hierarchical structure
  const processProductTypes = useCallback((data) => {
    if (!data || !data.productTypes || !data.topLevelProductTypes) {
      return;
    }

    // Create a mapping of id to node for easy lookup
    const idToNodeMap = new Map();
    data.productTypes.forEach((type) => {
      idToNodeMap.set(type.id, {
        ...type,
        childNodes: [] // Here we will populate the full child node, not only the id
      });
    });

    data.productTypes.forEach((type) => {
      if (type.children && type.children.length > 0) {
        const node = idToNodeMap.get(type.id);
        type.children.forEach((childId) => {
          const childNode = idToNodeMap.get(childId);
          if (childNode) {
            node.childNodes.push(childNode);
          }
        });
      }
    });

    // Get the top-level types
    const topLevelTypes = data.topLevelProductTypes
      .map((id) => idToNodeMap.get(id))
      .filter(Boolean);

    setHierarchicalProductTypes(topLevelTypes);
  }, []);

  const { isLoading, isError } = useAppQuery({
    url: '/api/shop/product-types',
    reactQueryOptions: {
      onSuccess: (data) => {
        processProductTypes(data);
      }
    }
  });

  useEffect(() => {
    if (value) {
      setSelectedProductType(value);
    }
  }, [value]);

  const handleToggleExpand = (id) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleProductTypeSelect = (id, label) => {
    setSelectedProductType({ id, label });
    if (onChange) {
      onChange({ id, label });
    }
  };

  // Recursive function to render the tree
  const renderTree = (nodes, level = 0) => {
    if (!nodes || nodes.length === 0) {
      return null;
    }

    return (
      <ul style={{
        listStyleType: 'none',
        padding: 0,
        margin: 0,
        marginLeft: level > 0 ? '20px' : '0'
      }}
      >
        {nodes.map((node) => {
          const hasChildren = node.childNodes && node.childNodes.length > 0;
          const isExpanded = expandedItems[node.id];
          const isSelected = selectedProductType && selectedProductType.id === node.id;

          return (
            <li key={node.id} style={{ margin: '5px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '28px', display: 'flex', justifyContent: 'center' }}>
                  {hasChildren && (
                    <Button
                      plain
                      icon={isExpanded ? ChevronDownMinor : ChevronRightMinor}
                      onClick={() => handleToggleExpand(node.id)}
                    />
                  )}
                </div>

                <Button
                  plain
                  onClick={() => handleProductTypeSelect(node.id, node.label)}
                >
                  <span style={{
                    color: isSelected ? '#008060' : '#000',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    backgroundColor: isSelected ? '#f2f2f2' : 'transparent',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}
                  >
                    {node.label}
                  </span>
                </Button>
              </div>

              {hasChildren && isExpanded && renderTree(node.childNodes, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <Spinner size="large" />
        <p>Loading product types...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <TextContainer>
        <p>Error loading product types. Please try again later.</p>
      </TextContainer>
    );
  }

  return (
    <Card>
      <Card.Section title="Select Default Product Type">
        <TextContainer>
          <p>
            Select a default product type for your catalog. This will be used as
            the default when creating new products.
          </p>
        </TextContainer>

        <div
          style={{ marginTop: '15px', maxHeight: '350px', overflowY: 'auto' }}
        >
          {renderTree(hierarchicalProductTypes)}
        </div>

        {selectedProductType && (
          <div
            style={{
              marginTop: '15px',
              padding: '10px',
              backgroundColor: '#f4f6f8',
              borderRadius: '4px'
            }}
          >
            <TextContainer>
              <p>
                Selected type:
                <strong>{selectedProductType.label}</strong>
              </p>
            </TextContainer>
          </div>
        )}
      </Card.Section>
    </Card>
  );
}
