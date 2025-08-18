import { useState } from 'react';
import { useQueryClient } from 'react-query';
import { useAppMutation } from '../../hooks';

export default function BulkActions({
  selectedResources,
  variantRows,
  toggleToast,
  clearSelection
}) {
  const [isBulkMutating, setIsBulkMutating] = useState(false);
  const queryClient = useQueryClient();

  const { mutateAsync: mutateBulkVariantStatus } = useAppMutation({
    reactQueryOptions: {
      onSuccess: (response) => {
        if (!response || typeof response !== 'object') {
          console.error('Invalid response from bulk update:', response);
          return;
        }

        // Cache update: Update products data with the response
        queryClient.setQueryData('/api/products', (old) => {
          if (!old?.products) {
            return old;
          }

          return {
            ...old,
            products: old.products.map((product) => {
              const productId = String(product.id);

              if (response[productId] && Array.isArray(response[productId])) {
                return {
                  ...product,
                  fdcVariants: response[productId]
                };
              }
              return product;
            })
          };
        });
      }
    }
  });

  const handleBulkAction = async (enable) => {
    if (selectedResources.length === 0) {
      return;
    }

    setIsBulkMutating(true);

    // Create a map of product IDs to variant IDs for the selected variants
    const productVariantsMap = {};
    selectedResources.forEach((variantRowId) => {
      const variantRow = variantRows.find((v) => v.id === variantRowId);
      if (variantRow) {
        const { productId } = variantRow;
        if (!productVariantsMap[productId]) {
          productVariantsMap[productId] = [];
        }
        productVariantsMap[productId].push(variantRow.variant.id);
      }
    });

    try {
      const response = await mutateBulkVariantStatus({
        url: '/api/products/bulk/fdcStatus',
        fetchInit: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            productVariantsMap,
            enabled: enable
          })
        }
      });

      const count = response && typeof response === 'object'
        ? Object.keys(response).length
        : 0;

      toggleToast(`${count || selectedResources.length} variants ${enable ? 'enabled' : 'disabled'} for FDC`);
      clearSelection();
    } catch (error) {
      console.error(`Error bulk ${enable ? 'enabling' : 'disabling'} variants`, error);
      toggleToast(`Failed to ${enable ? 'enable' : 'disable'} variants for FDC`);
    } finally {
      setIsBulkMutating(false);
    }
  };

  if (selectedResources.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        marginLeft: '16px'
      }}
    >
      <button
        type="button"
        style={{
          background: '#CDFEE1',
          color: '#303030',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 16px',
          cursor: isBulkMutating ? 'wait' : 'pointer',
          opacity: isBulkMutating ? 0.7 : 1,
          fontWeight: '500'
        }}
        onClick={() => handleBulkAction(true)}
        disabled={isBulkMutating}
      >
        {isBulkMutating ? 'Enabling...' : 'Enable all'}
      </button>
      <button
        type="button"
        style={{
          background: '#E3E3E3',
          color: '#303030',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 16px',
          cursor: isBulkMutating ? 'wait' : 'pointer',
          opacity: isBulkMutating ? 0.7 : 1,
          fontWeight: '500'
        }}
        onClick={() => handleBulkAction(false)}
        disabled={isBulkMutating}
      >
        {isBulkMutating ? 'Disabling...' : 'Disable all'}
      </button>
    </div>
  );
}
