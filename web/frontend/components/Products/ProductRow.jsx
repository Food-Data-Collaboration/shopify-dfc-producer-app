import { IndexTable, Tag, Thumbnail } from '@shopify/polaris';
import { useQueryClient } from 'react-query';
import { useAppMutation } from '../../hooks';
import { getMinPrice, getTotalInventory } from '../../utils/productUtils';
import { extractShopName } from '../../utils/shopUtils';
import ProductStatusBadge from './ProductStatusBadge';

export default function ProductRow({
  product,
  position,
  selectedResources,
  loadingProductIds,
  setLoadingProductIds,
  toggleToast
}) {
  const {
    id: productId, title, variants, images
  } = product;
  const isFDCEnabled = product.fdcVariants?.some(
    (variant) => variant.enabled
  );
  const isLoading = loadingProductIds.includes(productId);
  const queryClient = useQueryClient();

  const { mutateAsync: mutateProductStatus } = useAppMutation({
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

        // Remove the product from loading state
        setLoadingProductIds((prev) =>
          prev.filter((_id) => _id !== productId));
      },
      onError: (err) => {
        console.error('Error updating product status:', err);
        toggleToast('Failed to update product status');
        setLoadingProductIds((prev) =>
          prev.filter((_id) => _id !== productId));
      }
    }
  });

  const totalInventory = getTotalInventory(product);

  const inventoryDisplay =
    totalInventory > 0 ? (
      totalInventory.toString()
    ) : (
      <span style={{ color: '#d82c0d' }}>0 in stock</span>
    );

  const minPrice = getMinPrice(product);

  let thumbnailSrc = 'https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg';
  if (images && images.edges && images.edges.length > 0) {
    thumbnailSrc = images.edges[0].node.src;
  } else if (images && images.length > 0 && images[0]?.src) {
    thumbnailSrc = images[0].src;
  }

  const variantTags = variants?.map((v) => v.title).filter(Boolean) || [];

  const shopName = extractShopName();
  const productUrl = shopName
    ? `https://admin.shopify.com/store/${shopName}/products/${productId}`
    : `https://admin.shopify.com/products/${productId}`;

  const handleToggleFDC = () => {
    if (isLoading) {
      return;
    }

    const variantIds = variants.map(({ id }) => id);

    // Add product to loading state
    setLoadingProductIds((prev) => [...prev, productId]);

    mutateProductStatus({
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
          variants: variantIds
        })
      }
    })
      .then(() => {
        toggleToast(`Product ${isFDCEnabled ? 'disabled' : 'enabled'} for FDC`);
      })
      .catch((error) => {
        console.error('Error updating product status', error);
      });
  };

  return (
    <IndexTable.Row
      id={productId}
      key={productId}
      selected={selectedResources.includes(productId)}
      position={position}
    >
      <IndexTable.Cell>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Thumbnail source={thumbnailSrc} alt={title} size="small" />
          <div
            style={{ maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word' }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                window.open(productUrl, '_blank', 'noopener,noreferrer');
              }}
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
                  {title}
                </p>
              </div>
            </div>
          </div>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {variants?.map((v) =>
            (v.title ? <Tag key={v.id || v.title}>{v.title}</Tag> : null))}
          {variantTags.length === 0 && <span>Default</span>}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        $
        {minPrice.toFixed(2)}
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
