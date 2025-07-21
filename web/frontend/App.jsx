import { Loading, NavigationMenu } from '@shopify/app-bridge-react';
import { Card, SkeletonBodyText } from '@shopify/polaris';
import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import Routes from './Routes';

import {
  AppBridgeProvider,
  PolarisProvider,
  QueryProvider
} from './components';
import { useAppQuery } from './hooks';
import PostInstallationSetup from './pages/PostInstallationSetup';

function useShopDetails() {
  const [isSetupCompleted, setIsSetupCompleted] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersFeatureEnabled, setOrdersFeatureEnabled] = useState(false);
  const [shopName, setShopName] = useState(null);
  const [hasPermissions, setHasPermissions] = useState(false);

  const { data: shopData, isLoading: shopLoading } = useAppQuery({
    url: '/api/shop/details'
  });

  useEffect(() => {
    if (!shopLoading) {
      setIsSetupCompleted(shopData?.shop?.setupCompleted === true);
      setOrdersFeatureEnabled(shopData?.shop?.ordersFeatureEnabled === true);
      setHasPermissions(shopData?.shop?.hasPermissions === true);
      setIsLoading(false);
      setShopName(shopData?.shop.shopName);
    }
  }, [shopData, shopLoading]);

  return {
    isSetupCompleted,
    ordersFeatureEnabled,
    hasPermissions,
    isLoading: isLoading || shopLoading,
    shopName
  };
}

const getNavigationLinks = (ordersFeatureEnabled, hasPermissions) => {
  const links = [{ label: 'Platform authorisation', destination: '/platformAuthorisation' }];

  if (ordersFeatureEnabled) {
    links.unshift({ label: 'Hub Users', destination: '/hubUsers' });
  }

  if (hasPermissions) {
    links.unshift({ label: 'Products List', destination: '/products' });
  }

  return links;
};

function SetupCheck({ pages }) {
  const {
    isSetupCompleted, ordersFeatureEnabled, hasPermissions, isLoading, shopName
  } = useShopDetails();

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
      <NavigationMenu navigationLinks={getNavigationLinks(ordersFeatureEnabled, hasPermissions)} />
      <Routes pages={pages} shopName={shopName} hasPermissions={hasPermissions} />
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
