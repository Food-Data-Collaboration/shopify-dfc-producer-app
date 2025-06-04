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
import { filterProducts, sortProducts } from '../utils/productUtils';

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
  const [loadingProductIds, setLoadingProductIds] = useState([]);

  const ITEMS_PER_PAGE = 10;
  const products = data?.products || [];

  const filteredProducts = useMemo(
    () =>
      filterProducts(products, searchQuery, selectedTab),
    [products, searchQuery, selectedTab]
  );

  const sortedProducts = useMemo(
    () =>
      sortProducts(filteredProducts, sortIndex, sortDirection),
    [filteredProducts, sortIndex, sortDirection]
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

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedProducts, currentPage, ITEMS_PER_PAGE]);

  /**
   * resourceFilter is important here as we use pagination. Passing empty array as
   * as initial value will make the `Select All` checkbox not work correctly
   * and passing the full list of products will select all products in all pages
   * passing the paginated list of products will for some reason disable the `unselect all`
   * functionality, so we need to filter the products based on the current page.
   */
  const {
    selectedResources, allResourcesSelected, handleSelectionChange, clearSelection
  } = useIndexResourceState(products, {
    resourceFilter: (product) => paginatedProducts.findIndex(((p) => p.id === product.id)) !== -1
  });

  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) =>
      Math.min(prev + 1, Math.ceil(sortedProducts.length / ITEMS_PER_PAGE)));
  }, [sortedProducts.length]);

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
    filteredProducts.length === 0 ? (
      <EmptyState heading="No products found" image="/empty-state.svg">
        <p>Try changing your search term or filters.</p>
      </EmptyState>
    ) : null;

  return (
    <Frame>
      <Page title="Select products to share via the food data collaboration">
        <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
        <Layout>
          <Layout.Section>
            <div style={{ marginTop: '16px' }}>
              <Card>
                <div style={{ padding: '16px', display: 'flex' }}>
                  <div style={{ flex: 1 }}>
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

                  <BulkActions
                    selectedResources={selectedResources}
                    products={products}
                    toggleToast={toggleToast}
                    clearSelection={clearSelection}
                  />
                </div>

                {emptyStateMarkup || (
                  <ProductsTable
                    sortedProducts={sortedProducts}
                    paginatedProducts={paginatedProducts}
                    selectedResources={selectedResources}
                    allResourcesSelected={allResourcesSelected}
                    handleSelectionChange={handleSelectionChange}
                    loadingProductIds={loadingProductIds}
                    setLoadingProductIds={setLoadingProductIds}
                    products={products}
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
            </div>
          </Layout.Section>
        </Layout>
        {toastMarkup}
      </Page>
    </Frame>
  );
}
