export const getSortProperty = (index) => {
  switch (index) {
    case 0:
      return 'title';
    case 1:
      return 'variant';
    case 2:
      return 'price';
    case 3:
      return 'inventory';
    case 4:
      return 'status';
    default:
      return 'title';
  }
};

export const getTotalInventory = (product) => {
  if (!product.variants || product.variants.length === 0) {
    return 0;
  }

  return product.variants.reduce((total, variant) => {
    const quantity =
      typeof variant.inventoryQuantity === 'number'
        ? variant.inventoryQuantity
        : 0;
    // Only add positive inventory to the total
    return total + Math.max(0, quantity);
  }, 0);
};

export const getMinPrice = (product) => {
  const prices =
    product.variants?.map((variant) => parseFloat(variant.price)) || [];
  return prices.length > 0 ? Math.min(...prices) : 0;
};

export const filterProducts = (products, searchQuery, selectedTab) =>
  products.filter((product) => {
    const matchesFDC =
      selectedTab === 0
        ? true
        : product.fdcVariants?.some((variant) => variant.enabled);

    if (!searchQuery) {
      return matchesFDC;
    }

    const query = searchQuery.toLowerCase().trim();

    if (product.title && product.title.toLowerCase().includes(query)) {
      return matchesFDC;
    }

    if (
      product.variants &&
      product.variants.some(
        (v) => v.title && v.title.toLowerCase().includes(query)
      )
    ) {
      return matchesFDC;
    }

    if (
      product.variants &&
      product.variants.some((v) => v.sku && v.sku.toLowerCase().includes(query))
    ) {
      return matchesFDC;
    }

    return false;
  });

export const sortProducts = (filteredProducts, sortIndex, sortDirection) => {
  if (!filteredProducts || filteredProducts.length === 0) {
    return [];
  }

  const sorted = [...filteredProducts];
  const sortProperty = getSortProperty(sortIndex);

  const compareStrings = (a, b) => {
    if (!a && !b) {
      return 0;
    }
    if (!a) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (!b) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return sortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  };

  const compareNumbers = (a, b) => {
    if (a === b) {
      return 0;
    }
    return sortDirection === 'asc' ? a - b : b - a;
  };

  if (sortProperty === 'status') {
    return sorted.sort((a, b) => {
      const statusA = a.fdcVariants?.some((v) => v.enabled) ? 1 : 0;
      const statusB = b.fdcVariants?.some((v) => v.enabled) ? 1 : 0;
      return compareNumbers(statusA, statusB);
    });
  }

  if (sortProperty === 'inventory') {
    return sorted.sort((a, b) => {
      const inventoryA = getTotalInventory(a);
      const inventoryB = getTotalInventory(b);
      return compareNumbers(inventoryA, inventoryB);
    });
  }

  if (sortProperty === 'price') {
    return sorted.sort((a, b) => {
      const priceA = getMinPrice(a);
      const priceB = getMinPrice(b);
      return compareNumbers(priceA, priceB);
    });
  }

  if (sortProperty === 'variant') {
    return sorted.sort((a, b) => {
      const variantA =
        a.variants && a.variants.length > 0 ? a.variants[0].title || '' : '';
      const variantB =
        b.variants && b.variants.length > 0 ? b.variants[0].title || '' : '';
      return compareStrings(variantA, variantB);
    });
  }

  // Handle title and other string properties if exists
  return sorted.sort((a, b) => {
    const valueA = a[sortProperty] || '';
    const valueB = b[sortProperty] || '';
    return compareStrings(valueA, valueB);
  });
};

export const flattenProductsToVariants = (products) => {
  const variantRows = [];

  products.forEach((product) => {
    if (!product.variants || product.variants.length === 0) {
      // Handle products with no variants (if any!)
      variantRows.push({
        id: `${product.id}_default`,
        productId: product.id,
        productTitle: product.title,
        productImages: product.images,
        variant: {
          id: product.id,
          title: 'Default',
          price: '0.00',
          inventoryQuantity: 0,
          sku: ''
        },
        fdcVariants: product.fdcVariants || [],
        isFDCEnabled: product.fdcVariants?.some((v) => v.enabled) || false
      });
      return;
    }

    product.variants.forEach((variant) => {
      // Find the corresponding FDC variant for this specific variant
      const fdcVariant = product.fdcVariants?.find(
        (fv) => fv.retailVariantId === variant.id
      );
      const isFDCEnabled = fdcVariant?.enabled || false;

      variantRows.push({
        id: `${product.id}_${variant.id}`,
        productId: product.id,
        productTitle: product.title,
        productImages: product.images,
        variant,
        fdcVariants: fdcVariant ? [fdcVariant] : [],
        isFDCEnabled
      });
    });
  });

  return variantRows;
};

export const getVariantInventory = (variant) => {
  const quantity =
    typeof variant.inventoryQuantity === 'number'
      ? variant.inventoryQuantity
      : 0;
  return Math.max(0, quantity);
};

export const getVariantPrice = (variant) => parseFloat(variant.price) || 0;

export const filterVariants = (variants, searchQuery, selectedTab) =>
  variants.filter((variantRow) => {
    const matchesFDC = selectedTab === 0 ? true : variantRow.isFDCEnabled;

    if (!searchQuery) {
      return matchesFDC;
    }

    const query = searchQuery.toLowerCase().trim();

    if (
      variantRow.productTitle &&
      variantRow.productTitle.toLowerCase().includes(query)
    ) {
      return matchesFDC;
    }

    if (
      variantRow.variant.title &&
      variantRow.variant.title.toLowerCase().includes(query)
    ) {
      return matchesFDC;
    }

    if (
      variantRow.variant.sku &&
      variantRow.variant.sku.toLowerCase().includes(query)
    ) {
      return matchesFDC;
    }

    return false;
  });

export const sortVariants = (filteredVariants, sortIndex, sortDirection) => {
  if (!filteredVariants || filteredVariants.length === 0) {
    return [];
  }

  const sorted = [...filteredVariants];
  const sortProperty = getSortProperty(sortIndex);

  const compareStrings = (a, b) => {
    if (!a && !b) {
      return 0;
    }
    if (!a) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (!b) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return sortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  };

  const compareNumbers = (a, b) => {
    if (a === b) {
      return 0;
    }
    return sortDirection === 'asc' ? a - b : b - a;
  };

  if (sortProperty === 'status') {
    return sorted.sort((a, b) => {
      const statusA = a.isFDCEnabled ? 1 : 0;
      const statusB = b.isFDCEnabled ? 1 : 0;
      return compareNumbers(statusA, statusB);
    });
  }

  if (sortProperty === 'inventory') {
    return sorted.sort((a, b) => {
      const inventoryA = getVariantInventory(a.variant);
      const inventoryB = getVariantInventory(b.variant);
      return compareNumbers(inventoryA, inventoryB);
    });
  }

  if (sortProperty === 'price') {
    return sorted.sort((a, b) => {
      const priceA = getVariantPrice(a.variant);
      const priceB = getVariantPrice(b.variant);
      return compareNumbers(priceA, priceB);
    });
  }

  if (sortProperty === 'variant') {
    return sorted.sort((a, b) => {
      const variantA = a.variant.title || '';
      const variantB = b.variant.title || '';
      return compareStrings(variantA, variantB);
    });
  }

  // Handle title and other string properties
  return sorted.sort((a, b) => {
    let valueA;
    let valueB;

    if (sortProperty === 'title') {
      valueA = a.productTitle || '';
      valueB = b.productTitle || '';
    } else {
      valueA = a[sortProperty] || '';
      valueB = b[sortProperty] || '';
    }

    return compareStrings(valueA, valueB);
  });
};
