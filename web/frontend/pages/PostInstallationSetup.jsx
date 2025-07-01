import {
  Banner,
  Card,
  Frame,
  Heading,
  Layout, Page,
  Spinner,
  TextContainer
} from '@shopify/polaris';
import { useEffect, useState } from 'react';
import { useAppMutation } from '../hooks';

export default function PostInstallationSetup() {
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { mutateAsync, isLoading: isSaving } = useAppMutation({
    reactQueryOptions: {
      onSuccess: () => {
        setSetupSuccess(true);
        // Refresh the page after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      },
      onError: (error) => {
        setErrorMessage(error.message || 'An error occurred while completing setup');
      }
    }
  });

  useEffect(() => {
    const completeSetup = async () => {
      try {
        await mutateAsync({
          url: '/api/shop/complete-setup',
          fetchInit: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              variantMappingsEnabled: null,
              defaultProductType: null
            })
          }
        });
      } catch (error) {
        console.error('Error completing setup:', error);
      }
    };

    completeSetup();
  }, [mutateAsync]);

  return (
    <Page>
      <Frame>
        {setupSuccess && (
          <Banner
            title="Setup completed successfully"
            status="success"
          >
            <p>Your shop setup has been completed. You will be redirected shortly.</p>
          </Banner>
        )}

        {errorMessage && (
          <Banner
            title="Error completing setup"
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
                <Heading>Completing Your Shop Setup</Heading>
                {isSaving && (
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '20px' }}>
                    <Spinner size="small" />
                    <span style={{ marginLeft: '10px' }}>Setting up your shop...</span>
                  </div>
                )}
              </TextContainer>
            </Card>
          </Layout.Section>
        </Layout>
      </Frame>
    </Page>
  );
}
