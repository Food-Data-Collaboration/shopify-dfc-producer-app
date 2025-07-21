import { useEffect, useState } from 'react';
import { useAppQuery } from './useAppQuery';

export function useShopDetails() {
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

export default useShopDetails;
