export const extractShopName = () => {
  let shopName = '';
  try {
    // Try to get shop name from host parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const host = urlParams.get('host');
    if (host) {
      // The host param is base64 encoded with the format: admin.shopify.com/store/shop-name
      const decodedHost = atob(host);
      const shopMatch = decodedHost.match(/\/store\/([^\/]+)/);
      shopName = shopMatch ? shopMatch[1] : '';
    }

    // Fallback
    if (!shopName) {
      const shop = urlParams.get('shop');
      if (shop) {
        // Extract shop name from the myshopify.com domain
        shopName = shop.split('.')[0];
      }
    }
  } catch (error) {
    console.error('Error extracting shop name:', error);
  }

  return shopName;
};
