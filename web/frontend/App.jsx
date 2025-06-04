import { BrowserRouter } from 'react-router-dom';
import { NavigationMenu, Loading } from '@shopify/app-bridge-react';
import { Card, SkeletonBodyText } from '@shopify/polaris';
import { useEffect, useState } from 'react';
import Routes from './Routes';

import {
  AppBridgeProvider,
  QueryProvider,
  PolarisProvider
} from './components';
import { useAppQuery } from './hooks';
import PostInstallationSetup from './pages/PostInstallationSetup';

function useShopDetails() {
  const [isSetupCompleted, setIsSetupCompleted] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersFeatureEnabled, setOrdersFeatureEnabled] = useState(false);

  const { data: shopData, isLoading: shopLoading } = useAppQuery({
    url: '/api/shop/details'
  });

  useEffect(() => {
    if (!shopLoading) {
      setIsSetupCompleted(shopData?.shop?.setupCompleted === true);
      setOrdersFeatureEnabled(shopData?.shop?.ordersFeatureEnabled === true);
      setIsLoading(false);
    }
  }, [shopData, shopLoading]);

  return {
    isSetupCompleted,
    ordersFeatureEnabled,
    isLoading: isLoading || shopLoading
  };
}

const getNavigationLinks = (ordersFeatureEnabled) =>
  (ordersFeatureEnabled
    ? [{ label: 'Hub Users', destination: '/hubUsers' }]
    : []);

function SetupCheck({ pages }) {
  const { isSetupCompleted, ordersFeatureEnabled, isLoading } = useShopDetails();

  if (isLoading) {
    return (
      <Card sectioned>
        <Loading />
        <SkeletonBodyText />
      </Card>
    );
  }

  if (isSetupCompleted === false) {
    return <PostInstallationSetup />;
  }

  return (
    <>
      <NavigationMenu navigationLinks={getNavigationLinks(ordersFeatureEnabled)} />
      <Routes pages={pages} />
    </>
  );
}

export default function App() {
  // Any .tsx or .jsx files in /pages will become a route
  // See documentation for <Routes /> for more info
  const pages = import.meta.globEager('./pages/**/!(*.test.[jt]sx)*.([jt]sx)');

  return (
    <PolarisProvider>
      <BrowserRouter>
        <AppBridgeProvider>
          <QueryProvider>
            <SetupCheck pages={pages} />
          </QueryProvider>
        </AppBridgeProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
