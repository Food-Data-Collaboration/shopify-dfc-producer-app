import {
  Banner,
  Button,
  Card,
  Checkbox,
  Frame,
  Heading,
  Layout, Page,
  TextContainer
} from '@shopify/polaris';
import { useCallback, useState } from 'react';
import { useAppMutation } from '../hooks';
import ProductTypeSelector from '../components/ProductTypeSelector';

export default function PostInstallationSetup() {
  const [variantMappingsEnabled, setVariantMappingsEnabled] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [defaultProductType, setDefaultProductType] = useState(null);

  const { mutateAsync, isLoading: isSaving } = useAppMutation({
    reactQueryOptions: {
      onSuccess: () => {
        setSetupSuccess(true);
      },
      onError: (error) => {
        setErrorMessage(error.message || 'An error occurred while saving settings');
      }
    }
  });

  const handleSave = useCallback(async () => {
    setErrorMessage('');
    setSetupSuccess(false);

    try {
      await mutateAsync({
        url: '/api/shop/complete-setup',
        fetchInit: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            variantMappingsEnabled,
            defaultProductType: defaultProductType.id || null
          })
        }
      });

      // Refresh the page after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Error completing setup:', error);
    }
  }, [variantMappingsEnabled, defaultProductType, mutateAsync]);

  const handleProductTypeChange = useCallback((type) => {
    setDefaultProductType(type);
  }, []);

  return (
    <Page>
      <Frame>
        {setupSuccess && (
          <Banner
            title="Setup completed successfully"
            status="success"
            onDismiss={() => setSetupSuccess(false)}
          >
            <p>Your shop setup has been completed. You will be redirected shortly.</p>
          </Banner>
        )}

        {errorMessage && (
          <Banner
            title="Error saving settings"
            status="critical"
            onDismiss={() => setErrorMessage('')}
          >
            <p>{errorMessage}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card sectioned>
              <TextContainer>
                <Heading>Complete Your Shop Setup</Heading>
                <p>Please configure your shop preferences below to complete the setup process.</p>
              </TextContainer>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned title="FDC Settings">
              <TextContainer>
                <Checkbox
                  label="Enable Variant Mappings"
                  helpText="When enabled, you can map product variants to FDC products"
                  checked={variantMappingsEnabled}
                  onChange={setVariantMappingsEnabled}
                />
              </TextContainer>

              <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                <ProductTypeSelector
                  onChange={handleProductTypeChange}
                  value={defaultProductType}
                />
              </div>

              <div style={{ marginTop: '20px' }}>
                <Button
                  primary
                  onClick={handleSave}
                  loading={isSaving}
                  disabled={isSaving}
                >
                  Complete Setup
                </Button>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Frame>
    </Page>
  );
}
