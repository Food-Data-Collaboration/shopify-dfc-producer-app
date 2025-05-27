export default async function getShopDetails(client) {
  const response = await client.request(`
    query GetShopDetails {
      shop {
        contactEmail
        name
        description
        shopOwnerName
        primaryDomain {
          url
        }
      }
      locations(first: 1) {
        edges {
          node {
            id
            name
            address {
              address1
              address2
              city
              country
              province
              zip
              phone
            }
          }
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

  console.log(response.data.locations.edges[0].node);

  const address = response.data.locations.edges?.length > 0 &&
    response.data.locations.edges[0].node.address;

  return { ...response.data.shop, businessAddress: address };
}
