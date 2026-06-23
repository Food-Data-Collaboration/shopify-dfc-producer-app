import { BrowserRouter } from 'react-router-dom';
import { Card, SkeletonBodyText, Spinner } from '@shopify/polaris';
import { useEffect, useState } from 'react';
import Routes from './Routes';

import {
  QueryProvider,
  PolarisProvider
} from './components';
import { useAppQuery } from './hooks';
import PostInstallationSetup from './pages/PostInstallationSetup';

export default function App() {
  const pages = import.meta.globEager('./pages/**/!(*.test.[jt]sx)*.([jt]sx)');
  const [isSetupCompleted, setIsSetupCompleted] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersFeatureEnabled, setOrdersFeatureEnabled] = useState(false);

  function SetupCheck() {
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

    if (isLoading || shopLoading) {
      return (
        <Card sectioned>
          <Spinner />
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
          {ordersFeatureEnabled && (
            <a href="/hubUsers">Hub Users</a>
          )}
        </s-app-nav>
        <Routes pages={pages} />
      </>
    );
  }

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <SetupCheck />
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
