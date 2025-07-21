import { Loading, NavigationMenu } from '@shopify/app-bridge-react';
import { Card, SkeletonBodyText } from '@shopify/polaris';
import { BrowserRouter } from 'react-router-dom';
import Routes from './Routes';

import {
  AppBridgeProvider,
  PolarisProvider,
  QueryProvider
} from './components';
import { useShopDetails } from './hooks';
import PostInstallationSetup from './pages/PostInstallationSetup';

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
