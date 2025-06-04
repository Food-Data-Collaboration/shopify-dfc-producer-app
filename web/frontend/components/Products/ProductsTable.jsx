import { IndexTable, Pagination } from '@shopify/polaris';
import ProductRow from './ProductRow';

export default function ProductsTable({
  sortedProducts,
  paginatedProducts,
  selectedResources,
  allResourcesSelected,
  handleSelectionChange,
  loadingProductIds,
  setLoadingProductIds,
  products,
  toggleToast,
  sortDirection,
  sortIndex,
  onSort,
  currentPage,
  itemsPerPage,
  onPreviousPage,
  onNextPage
}) {
  const resourceName = {
    singular: 'product',
    plural: 'products'
  };

  const rowMarkup = paginatedProducts.map((product, index) => (
    <ProductRow
      key={product.id}
      product={product}
      position={index}
      selectedResources={selectedResources}
      loadingProductIds={loadingProductIds}
      setLoadingProductIds={setLoadingProductIds}
      products={products}
      toggleToast={toggleToast}
    />
  ));

  return (
    <>
      <IndexTable
        resourceName={resourceName}
        itemCount={sortedProducts.length}
        selectedItemsCount={
            allResourcesSelected ? 'All' : selectedResources.length
          }
        onSelectionChange={handleSelectionChange}
        headings={[
          { title: 'Product' },
          { title: 'Variant' },
          { title: 'Price' },
          { title: 'Inventory' },
          { title: 'Status' }
        ]}
        bulkActions={[]}
        sortable={[true, true, true, true, true]}
        sortDirection={sortDirection}
        sortColumnIndex={sortIndex}
        onSort={onSort}
        selectable
        columnContentTypes={[
          'text',
          'text',
          'text',
          'numeric',
          'text'
        ]}
      >
        {rowMarkup}
      </IndexTable>

      <div
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        <Pagination
          hasPrevious={currentPage > 1}
          onPrevious={onPreviousPage}
          hasNext={
            currentPage <
            Math.ceil(sortedProducts.length / itemsPerPage)
          }
          onNext={onNextPage}
          label={`${currentPage} of ${Math.ceil(
            sortedProducts.length / itemsPerPage
          )}`}
        />
      </div>
    </>
  );
}
