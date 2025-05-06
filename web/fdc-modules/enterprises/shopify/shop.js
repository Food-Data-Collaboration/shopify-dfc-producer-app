export default async function getShopDetails(client) {
  const response = await client.request(`
    query GetShopDetails {
      shop {
        contactEmail
        name
        description
        shopOwnerName
        billingAddress {
          address1
          address2
          city
          country
          province
          zip
          phone
        }
        primaryDomain {
          url
        }
      } 
    }`);

  if (response.errors) {
    console.error('Failed to load Shop', JSON.stringify(response.errors));
    throw new Error('Failed to load Shop', response.errors);
  }

  if (!response.data.shop) {
    return null;
  }

  return response.data.shop;
}
