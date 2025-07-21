import {
  Button,
  Card,
  Layout,
  Page,
  TextContainer
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { Loading } from '@shopify/app-bridge-react';
import { useShopDetails } from '../hooks';

export default function Home() {
  const navigate = useNavigate();

  const {
    hasPermissions, isLoading
  } = useShopDetails();

  return isLoading ? <Loading /> : (
    <Page>
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <TextContainer spacing="tight">
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <img
                  src="/assets/home-page-stage.svg"
                  alt="FDC Home"
                  style={{
                    marginBottom: '24px',
                    maxWidth: '100%',
                    height: 'auto'
                  }}
                />
                <h1
                  style={{
                    fontSize: '36px',
                    fontWeight: 700,
                    margin: '0 0 24px 0',
                    lineHeight: '1.1'
                  }}
                >
                  Welcome to the FDC producer app
                </h1>
                <p
                  style={{
                    fontSize: '12px',
                    marginTop: '0',
                    maxWidth: '500px',
                    margin: '0 auto 20px auto'
                  }}
                >
                  This application helps you share products from your shop with
                  selected agroecological organisations to help reach more
                  like-minded customers and create short resilient supply
                  networks.
                </p>
                {!hasPermissions && (
                  <div style={{ marginTop: '20px' }}>
                    <Button
                      primary
                      onClick={() => navigate('/platformAuthorisation')}
                    >
                      Get started
                    </Button>
                  </div>
                )}
              </div>
            </TextContainer>
          </Card>
        </Layout.Section>

        {hasPermissions && (
          <Layout.Section>
            <Card sectioned>
              <TextContainer>
                <p>
                  <strong>
                    It looks like you&apos;ve already granted permissions set for
                    your shop to share your products
                  </strong>
                </p>
                <p>
                  You can now select products to share on your agroecological
                  platform or directory.
                </p>
                <div
                  style={{ marginTop: '20px', display: 'flex', gap: '12px' }}
                >
                  <Button
                    outline
                    onClick={() => navigate('/platformAuthorisation')}
                  >
                    Edit permissions
                  </Button>
                  <Button primary onClick={() => navigate('/products')}>
                    Get started
                  </Button>
                </div>
              </TextContainer>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
