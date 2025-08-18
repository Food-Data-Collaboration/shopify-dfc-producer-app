import { IndexTable, Pagination } from '@shopify/polaris';
import ProductRow from './ProductRow';

export default function ProductsTable({
  sortedVariants,
  paginatedVariants,
  selectedResources,
  allResourcesSelected,
  handleSelectionChange,
  loadingVariantIds,
  setLoadingVariantIds,
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

  const rowMarkup = paginatedVariants.map((variantRow, index) => (
    <ProductRow
      key={variantRow.id}
      variantRow={variantRow}
      position={index}
      selectedResources={selectedResources}
      loadingVariantIds={loadingVariantIds}
      setLoadingVariantIds={setLoadingVariantIds}
      toggleToast={toggleToast}
    />
  ));

  return (
    <>
      <IndexTable
        resourceName={resourceName}
        itemCount={sortedVariants.length}
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
            Math.ceil(sortedVariants.length / itemsPerPage)
          }
          onNext={onNextPage}
          label={`${currentPage} of ${Math.ceil(
            sortedVariants.length / itemsPerPage
          )}`}
        />
      </div>
    </>
  );
}
