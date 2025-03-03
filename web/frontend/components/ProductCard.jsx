import {
  Checkbox,
  FormControlLabel,
  Stack,
  Typography
} from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import React from 'react';
import { useQueryClient } from 'react-query';
import { useAppMutation } from '../hooks';
import { ExpandMoreIcon } from './ExpandMoreIcon';
import { VariantMappingComponent } from './VariantMapping';
import { VariantComponent } from './Variant';

export default function ProductCard({ product, variantMappingEnabled }) {
  const queryClient = useQueryClient();

  function updateOrReplace(fdcVariants, updatedVariant, variables) {
    const { method } = variables.fetchInit;
    if (method === 'PUT') {
      return [...fdcVariants, updatedVariant];
    } if (method === 'POST' && Array.isArray(updatedVariant)) {
      return updatedVariant;
    } if (method === 'POST') {
      return fdcVariants.map((variant) => (variant.id === updatedVariant.id ? updatedVariant : variant));
    } if (method === 'DELETE') {
      return fdcVariants.filter((variant) => variant.id !== variables.variantId);
    }
    throw new Error(`dont know how to handle ${method}`);
  }

  const { mutateAsync: mutateMapping, isLoading, isFetching: productsLoading } = useAppMutation({
    reactQueryOptions: {
      onSuccess: (updatedVariant, variables) => {
        queryClient.setQueryData('/api/products', (query) => {
          const updatedProducts = query?.products?.map((existingProduct) => {
            if (existingProduct.id === product.id) {
              return {
                ...existingProduct,
                fdcVariants: updateOrReplace(existingProduct.fdcVariants, updatedVariant, variables)
              };
            }
            return existingProduct;
          });

          return {
            ...query,
            products: updatedProducts
          };
        });
      }
    }
  });

  const isFdcProduct = !!product.fdcVariants.find(({ enabled }) => enabled);
  const hasVariantMapped = !!product.fdcVariants[0];
  const allVariantsEnabled = product.fdcVariants.length > 0 &&
    product.variants.length === product.fdcVariants.filter(({ enabled }) => enabled).length;

  const colour = hasVariantMapped && isFdcProduct ? 'green' : isFdcProduct ? 'red' : 'gray';

  const toggleAllVariants = async () => {
    await mutateMapping({
      url: `/api/products/${product.id}/fdcStatus`,
      fetchInit: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled: !allVariantsEnabled, variants: product.variants.map(({ id }) => id) })
      }

    });
  };

  return (
    <Accordion key={product.id} slotProps={{ transition: { unmountOnExit: true } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" justifyContent="space-between" width="100%">
          <Typography variant="h6">
            {product.title}
            {' '}
            -
            {' '}
            <span style={{ color: colour, fontSize: 15, verticalAlign: 'text-top' }}>{isFdcProduct ? 'Has FDC Enabled Variants' : 'Not FDC Product'}</span>
          </Typography>
          <Stack spacing="20px" direction="row" alignItems="center">
            {!variantMappingEnabled && (
            <FormControlLabel
              style={{ pointerEvents: 'none' }}
              control={(
                <Checkbox
                  style={{
                    width: '50px',
                    pointerEvents: 'auto'
                  }}
                  disabled={productsLoading || isLoading}
                  onClick={toggleAllVariants}
                  checked={allVariantsEnabled}
                />
            )}
              label="Toggle FDC status"
              labelPlacement="start"
            />
            )}
          </Stack>

        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing="12px">
          {variantMappingEnabled ? (
            <VariantMappingComponent
              key={`${product.id}_variant${product.fdcVariants.length ? '' : '_missing'}`}
              mutateMapping={mutateMapping}
              product={product}
              variant={product.fdcVariants[0]}
              loadingInProgress={isLoading || productsLoading}
            />
          )
            :
            product.variants.map((variant) =>
              (
                <VariantComponent
                  key={`${product.id}_variant_${variant.id}'`}
                  product={product}
                  variant={variant}
                  fdcVariants={product.fdcVariants}
                  mutateMapping={mutateMapping}
                />
              ))
          }
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
