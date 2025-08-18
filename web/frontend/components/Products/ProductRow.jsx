import { IndexTable, Tag, Thumbnail } from '@shopify/polaris';
import { useQueryClient } from 'react-query';
import { useAppMutation } from '../../hooks';
import { getVariantInventory, getVariantPrice } from '../../utils/productUtils';
import { extractShopName } from '../../utils/shopUtils';
import ProductStatusBadge from './ProductStatusBadge';

export default function ProductRow({
  variantRow,
  position,
  selectedResources,
  loadingVariantIds,
  setLoadingVariantIds,
  toggleToast
}) {
  const {
    id: variantRowId,
    productId,
    productTitle,
    productImages,
    variant,
    isFDCEnabled
  } = variantRow;

  const isLoading = loadingVariantIds.includes(variantRowId);
  const queryClient = useQueryClient();

  const { mutateAsync: mutateVariantStatus } = useAppMutation({
    reactQueryOptions: {
      onSuccess: (response) => {
        // Cache update: Update products data with the response
        queryClient.setQueryData('/api/products', (old) => {
          if (!old?.products) {
            return old;
          }

          return {
            ...old,
            products: old.products.map((p) => {
              if (p.id === productId) {
                return {
                  ...p,
                  fdcVariants: response || []
                };
              }
              return p;
            })
          };
        });

        // Remove the variant from loading state
        setLoadingVariantIds((prev) =>
          prev.filter((_id) => _id !== variantRowId));
      },
      onError: (err) => {
        console.error('Error updating variant status:', err);
        toggleToast('Failed to update variant status');
        setLoadingVariantIds((prev) =>
          prev.filter((_id) => _id !== variantRowId));
      }
    }
  });

  const inventory = getVariantInventory(variant);
  const inventoryDisplay =
    inventory > 0 ? (
      inventory.toString()
    ) : (
      <span style={{ color: '#d82c0d' }}>0 in stock</span>
    );

  const price = getVariantPrice(variant);

  let thumbnailSrc = 'https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg';
  if (productImages && productImages.edges && productImages.edges.length > 0) {
    thumbnailSrc = productImages.edges[0].node.src;
  } else if (productImages && productImages.length > 0 && productImages[0]?.src) {
    thumbnailSrc = productImages[0].src;
  }

  const shopName = extractShopName();
  const productUrl = shopName
    ? `https://admin.shopify.com/store/${shopName}/products/${productId}`
    : `https://admin.shopify.com/products/${productId}`;

  const handleToggleFDC = () => {
    if (isLoading) {
      return;
    }

    // Add variant to loading state
    setLoadingVariantIds((prev) => [...prev, variantRowId]);

    mutateVariantStatus({
      url: `/api/products/${productId}/fdcStatus`,
      productId,
      currentStatus: isFDCEnabled,
      fetchInit: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: !isFDCEnabled,
          variants: [variant.id]
        })
      }
    })
      .then(() => {
        toggleToast(`Variant ${isFDCEnabled ? 'disabled' : 'enabled'} for FDC`);
      })
      .catch((error) => {
        console.error('Error updating variant status', error);
      });
  };

  const handleProductClick = (e) => {
    e.stopPropagation();
    window.top.location.href = productUrl;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleProductClick(e);
    }
  };

  return (
    <IndexTable.Row
      id={variantRowId}
      key={variantRowId}
      selected={selectedResources.includes(variantRowId)}
      position={position}
    >
      <IndexTable.Cell>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Thumbnail source={thumbnailSrc} alt={productTitle} size="small" />
          <div
            style={{ maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word' }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={handleProductClick}
              onKeyDown={handleKeyDown}
              style={{
                color: '#2c6ecb',
                textDecoration: 'none',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <div style={{ minWidth: '200px' }}>
                <p
                  style={{
                    wordBreak: 'break-word',
                    whiteSpace: 'normal',
                    lineHeight: '1.4',
                    margin: 0
                  }}
                >
                  {productTitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {variant.title ? <Tag>{variant.title}</Tag> : <span>Default</span>}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        $
        {price.toFixed(2)}
      </IndexTable.Cell>
      <IndexTable.Cell>{inventoryDisplay}</IndexTable.Cell>
      <IndexTable.Cell>
        <ProductStatusBadge
          isEnabled={isFDCEnabled}
          isLoading={isLoading}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleFDC();
          }}
        />
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}
