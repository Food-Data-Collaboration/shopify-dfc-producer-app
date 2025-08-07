import { Loading } from '@shopify/app-bridge-react';
import {
  Card,
  EmptyState,
  Frame,
  Layout,
  Page,
  SkeletonBodyText,
  Tabs,
  TextField,
  Toast,
  useIndexResourceState
} from '@shopify/polaris';
import {
  useCallback, useMemo, useState
} from 'react';
import BulkActions from '../components/Products/BulkActions';
import ProductsTable from '../components/Products/ProductsTable';
import { useAppQuery } from '../hooks';
import { filterVariants, sortVariants, flattenProductsToVariants } from '../utils/productUtils';

export default function ProductsPage() {
  const { data, isLoading } = useAppQuery({
    url: '/api/products'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortIndex, setSortIndex] = useState(0);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingVariantIds, setLoadingVariantIds] = useState([]);

  const ITEMS_PER_PAGE = 10;
  const products = data?.products || [];

  // Flatten products into individual variant rows
  const allVariants = useMemo(
    () => flattenProductsToVariants(products),
    [products]
  );

  const filteredVariants = useMemo(
    () =>
      filterVariants(allVariants, searchQuery, selectedTab),
    [allVariants, searchQuery, selectedTab]
  );

  const sortedVariants = useMemo(
    () =>
      sortVariants(filteredVariants, sortIndex, sortDirection),
    [filteredVariants, sortIndex, sortDirection]
  );

  const handleSort = useCallback(
    (index, direction) => {
      if (sortIndex === index) {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortDirection(newDirection);
      } else {
        setSortIndex(index);
        setSortDirection(direction);
      }

      setCurrentPage(1);
    },
    [sortIndex, sortDirection]
  );

  const paginatedVariants = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedVariants.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedVariants, currentPage, ITEMS_PER_PAGE]);

  /**
   * resourceFilter is important here as we use pagination. Passing empty array as
   * as initial value will make the `Select All` checkbox not work correctly
   * and passing the full list of variants will select all variants in all pages
   * passing the paginated list of variants will for some reason disable the `unselect all`
   * functionality, so we need to filter the variants based on the current page.
   */
  const {
    selectedResources, allResourcesSelected, handleSelectionChange, clearSelection
  } = useIndexResourceState(allVariants, {
    resourceFilter: (variant) => paginatedVariants.findIndex(((v) => v.id === variant.id)) !== -1
  });

  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) =>
      Math.min(prev + 1, Math.ceil(sortedVariants.length / ITEMS_PER_PAGE)));
  }, [sortedVariants.length]);

  const toggleToast = useCallback((message) => {
    setToastMessage(message);
    setShowToast(true);
  }, []);

  const handleTabChange = useCallback((selectedTabIndex) => {
    setSelectedTab(selectedTabIndex);
    setCurrentPage(1);
    if (selectedResources.length > 0) {
      handleSelectionChange('page', false);
    }
  }, [handleSelectionChange, selectedResources.length]);

  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const tabs = [
    {
      id: 'all-products',
      content: 'All',
      accessibilityLabel: 'All products',
      panelID: 'all-products-content'
    },
    {
      id: 'fdc-products',
      content: 'FDC enabled products',
      accessibilityLabel: 'FDC enabled products',
      panelID: 'fdc-products-content'
    }
  ];

  const toastMarkup = showToast ? (
    <Toast content={toastMessage} onDismiss={() => setShowToast(false)} />
  ) : null;

  if (isLoading) {
    return (
      <Page title="Products">
        <Card sectioned>
          <Loading />
          <SkeletonBodyText />
        </Card>
      </Page>
    );
  }

  if (products.length === 0) {
    return (
      <Page title="Products">
        <Layout>
          <Layout.Section>
            <EmptyState heading="No products found" image="/empty-state.svg">
              <p>No products are available in your store yet.</p>
            </EmptyState>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const emptyStateMarkup =
    filteredVariants.length === 0 ? (
      <EmptyState heading="No products found" image="/empty-state.svg">
        <p>Try changing your search term or filters.</p>
      </EmptyState>
    ) : null;

  return (
    <Frame>
      <Page title="Select products to share via the food data collaboration">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '16px' }}>
                <TextField
                  label="Search products"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search products by name, variant, or SKU"
                  clearButton
                  onClearButtonClick={() => handleSearchChange('')}
                  labelHidden
                />
              </div>

              <div style={{ borderTop: '1px solid #e1e3e5' }} />

              <div>
                <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
              </div>

              <div style={{ borderTop: '1px solid #e1e3e5' }} />

              <div style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <BulkActions
                  selectedResources={selectedResources}
                  variantRows={allVariants}
                  toggleToast={toggleToast}
                  clearSelection={clearSelection}
                />
              </div>

              {emptyStateMarkup || (
                <ProductsTable
                  sortedVariants={sortedVariants}
                  paginatedVariants={paginatedVariants}
                  selectedResources={selectedResources}
                  allResourcesSelected={allResourcesSelected}
                  handleSelectionChange={handleSelectionChange}
                  loadingVariantIds={loadingVariantIds}
                  setLoadingVariantIds={setLoadingVariantIds}
                  toggleToast={toggleToast}
                  sortDirection={sortDirection}
                  sortIndex={sortIndex}
                  onSort={handleSort}
                  currentPage={currentPage}
                  itemsPerPage={ITEMS_PER_PAGE}
                  onPreviousPage={handlePreviousPage}
                  onNextPage={handleNextPage}
                />
              )}
            </Card>
          </Layout.Section>
        </Layout>
        {toastMarkup}
      </Page>
    </Frame>
  );
}
