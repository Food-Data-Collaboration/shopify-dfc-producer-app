import { Card, SkeletonBodyText, Spinner } from '@shopify/polaris';
import { BrowserRouter } from 'react-router-dom';
import Routes from './Routes';

import {
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
        <Spinner accessibilityLabel="Loading" />
        <SkeletonBodyText />
      </Card>
    );
  }

  if (isSetupCompleted === false) {
    return <PostInstallationSetup />;
  }

  return (
    <>
      <s-app-nav>
        {getNavigationLinks(ordersFeatureEnabled, hasPermissions).map((link) => {
          const href = link.destination.includes('?')
            ? link.destination
            : `${link.destination}${window.location.search}`;
          return (
            <a key={link.destination} href={href}>
              {link.label}
            </a>
          );
        })}
      </s-app-nav>
      <Routes pages={pages} shopName={shopName} hasPermissions={hasPermissions} />
    </>
  );
}

export default function App() {
  const pages = import.meta.glob('./pages/**/!(*.test.[jt]sx)*.([jt]sx)', { eager: true });

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <SetupCheck pages={pages} />
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
