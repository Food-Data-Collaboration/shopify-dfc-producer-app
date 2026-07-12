import { Button, Stack, TextField } from '@mui/material';
import { Card, SkeletonBodyText, Spinner } from '@shopify/polaris';
import React, { useState } from 'react';
import ProductCard from '../components/ProductCard';
import { useAppQuery } from '../hooks';

export default function HomePage() {
  const { data, isLoading } = useAppQuery({
    url: '/api/products'
  });
  const [showFDCProducts, setShowFDCProducts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const products = data?.products;

  const filteredProducts = products?.filter((product) => {
    const matchesFDC = showFDCProducts
      ? product.fdcVariants?.some((variant) => variant.enabled)
      : true;
    const matchesSearch =
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.variants?.some((variant) =>
        variant.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFDC && matchesSearch;
  });

  if (isLoading) {
    return (
      <Card sectioned>
        <Spinner />
        <SkeletonBodyText />
      </Card>
    );
  }

  return (
    <div>
      <h1
        style={{
          textAlign: 'center',
          fontSize: '2em',
          fontWeight: 'bold'
        }}
      >
        Products
      </h1>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '20px',
          marginTop: '20px'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            padding: '20px'
          }}
        >
          <TextField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products"
            style={{ width: '300px' }}
          />

          <Button
            variant="contained"
            onClick={() => setShowFDCProducts((prev) => !prev)}
          >
            {showFDCProducts ? 'Show All Products' : 'Only show FDC products'}
          </Button>
        </div>
      </div>
      <h3
        style={{
          textAlign: 'center',
          fontSize: '1.2em',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}
      >
        Select a product to make it an FDC product.
      </h3>
      {filteredProducts?.length === 0 ? (
        <p style={{ textAlign: 'center' }}>No products found</p>
      ) : (
        <Stack spacing="12px" px="60px" py="12px">
          {filteredProducts?.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              variantMappingEnabled={data?.variantMappingEnabled}
            />
          ))}
        </Stack>
      )}
    </div>
  );
}
