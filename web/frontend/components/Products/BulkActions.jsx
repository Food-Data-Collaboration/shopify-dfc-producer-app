import { useState } from 'react';
import { useQueryClient } from 'react-query';
import { useAppMutation } from '../../hooks';

export default function BulkActions({
  selectedResources,
  products,
  toggleToast,
  clearSelection
}) {
  const [isBulkMutating, setIsBulkMutating] = useState(false);
  const queryClient = useQueryClient();

  const { mutateAsync: mutateBulkProductStatus } = useAppMutation({
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

    // Create a map of product IDs to variant IDs
    const productVariantsMap = {};
    selectedResources.forEach((productId) => {
      const product = products.find((p) => p.id === productId);
      if (product && product.variants) {
        productVariantsMap[productId] = product.variants.map((v) => v.id);
      }
    });

    try {
      const response = await mutateBulkProductStatus({
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

      toggleToast(`${count || selectedResources.length} products ${enable ? 'enabled' : 'disabled'} for FDC`);
      clearSelection();
    } catch (error) {
      console.error(`Error bulk ${enable ? 'enabling' : 'disabling'} products`, error);
      toggleToast(`Failed to ${enable ? 'enable' : 'disable'} products for FDC`);
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
          background: '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 16px',
          cursor: isBulkMutating ? 'wait' : 'pointer',
          opacity: isBulkMutating ? 0.7 : 1
        }}
        onClick={() => handleBulkAction(true)}
        disabled={isBulkMutating}
      >
        {isBulkMutating ? 'Enabling...' : 'Enable all'}
      </button>
      <button
        type="button"
        style={{
          background: '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 16px',
          cursor: isBulkMutating ? 'wait' : 'pointer',
          opacity: isBulkMutating ? 0.7 : 1
        }}
        onClick={() => handleBulkAction(false)}
        disabled={isBulkMutating}
      >
        {isBulkMutating ? 'Disabling...' : 'Disable all'}
      </button>
    </div>
  );
}
