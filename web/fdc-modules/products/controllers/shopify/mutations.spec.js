/**
 * Tests for the Shopify write helpers.
 *
 * These exist because mocking `client.request` proves nothing about whether a
 * mutation would survive GraphQL validation — which is precisely the bug this
 * module had: it sent `title` and `imageSrc` on `ProductVariantsBulkInput`,
 * neither of which is a field of that input, so Shopify rejected every
 * product PUT/PATCH before it wrote anything and the mock-based controller
 * tests stayed green throughout.
 *
 * So the assertions here are against the *field list*, not against a mock.
 */
import {
  PRODUCT_VARIANT_BULK_INPUT_FIELDS,
  buildVariantInput,
  findShopCurrency,
  findVariant,
  updateProductDetails,
  updateVariantInShopify
} from './mutations.js';

const VARIANT_ID = 4242;
const PRODUCT_ID = 99;

/** Records what was requested, and replays a canned response. */
const makeClient = (response = {}) => {
  const client = {
    calls: [],
    async request(query, { variables } = {}) {
      client.calls.push({ query, variables });
      return response;
    }
  };
  return client;
};

const okVariantUpdate = {
  data: { productVariantsBulkUpdate: { userErrors: [], productVariants: [{ id: 'gid://shopify/ProductVariant/4242' }] } }
};
const okProductUpdate = {
  data: { productUpdate: { userErrors: [], product: { id: 'gid://shopify/Product/99' } } }
};

describe('buildVariantInput', () => {
  it('emits only fields that ProductVariantsBulkInput accepts', () => {
    const input = buildVariantInput({ price: '2.49' }, VARIANT_ID);

    Object.keys(input).forEach((key) => {
      expect(PRODUCT_VARIANT_BULK_INPUT_FIELDS).toContain(key);
    });
  });

  it('rejects a variant title, which the input does not accept', () => {
    // Regression guard for the original bug. A Shopify variant's title comes
    // from its option values; there is no input that sets it, so the caller is
    // told rather than silently losing the field.
    expect(() => buildVariantInput({ title: 'Apples' }, VARIANT_ID)).toThrow(/title/);
    expect(PRODUCT_VARIANT_BULK_INPUT_FIELDS).not.toContain('title');
  });

  it('rejects imageSrc, which the input does not accept', () => {
    expect(() => buildVariantInput({ imageSrc: 'https://img/x.jpg' }, VARIANT_ID))
      .toThrow(/imageSrc/);
    expect(PRODUCT_VARIANT_BULK_INPUT_FIELDS).not.toContain('imageSrc');
  });

  it('nests SKU under inventoryItem, where the API expects it', () => {
    const input = buildVariantInput({ sku: 'ABC-1' }, VARIANT_ID);

    expect(input.inventoryItem).toEqual({ sku: 'ABC-1' });
    expect(input).not.toHaveProperty('sku');
  });

  it('always includes the variant id as a gid', () => {
    const input = buildVariantInput({ price: '1' }, VARIANT_ID);

    expect(input.id).toBe(`gid://shopify/ProductVariant/${VARIANT_ID}`);
  });

  it('coerces price and sku to strings, as the API expects Money', () => {
    const input = buildVariantInput({ price: 2.5, sku: 12345 }, VARIANT_ID);

    expect(input.price).toBe('2.5');
    expect(input.inventoryItem.sku).toBe('12345');
  });

  it('omits null values rather than sending them', () => {
    const input = buildVariantInput({ price: null, sku: null }, VARIANT_ID);

    expect(Object.keys(input)).toEqual(['id']);
  });

  it('rejects an unsupported field instead of silently dropping it', () => {
    // The original bug was a caller setting `title`/`imageSrc` and having them
    // vanish, so a silent drop is exactly the wrong behaviour. An unknown key
    // must fail at the boundary.
    expect(() => buildVariantInput({ nonsense: true }, VARIANT_ID))
      .toThrow(/nonsense/);
    expect(() => buildVariantInput({ title: 'Apples' }, VARIANT_ID))
      .toThrow(/title/);
    expect(() => buildVariantInput({ imageSrc: 'https://img' }, VARIANT_ID))
      .toThrow(/imageSrc/);
  });

  it('accepts every supported writable field without throwing', () => {
    expect(() => buildVariantInput({
      price: '1',
      sku: 'S',
      compareAtPrice: '2',
      inventoryPolicy: 'CONTINUE',
      taxable: true
    }, VARIANT_ID)).not.toThrow();
  });

  it('ignores the bookkeeping fields a caller passes alongside the update', () => {
    // `productId` is carried on `update` only so the mutation can name its
    // parent; it is not part of the variant input.
    const input = buildVariantInput({ price: '1', productId: PRODUCT_ID }, VARIANT_ID);

    expect(input).toEqual({ id: `gid://shopify/ProductVariant/${VARIANT_ID}`, price: '1' });
  });
});

describe('updateVariantInShopify', () => {
  it('sends a valid input and returns the updated variant', async () => {
    const client = makeClient(okVariantUpdate);

    const result = await updateVariantInShopify(client, { retailVariantId: VARIANT_ID }, {
      price: '2.49',
      productId: PRODUCT_ID
    });

    expect(result).toEqual({ id: 'gid://shopify/ProductVariant/4242' });
    const [call] = client.calls;
    expect(call.variables.input).toEqual({
      id: `gid://shopify/ProductVariant/${VARIANT_ID}`,
      price: '2.49'
    });
    expect(call.variables.productId).toBe(`gid://shopify/Product/${PRODUCT_ID}`);
    expect(call.query).toContain('productVariantsBulkUpdate');
  });

  it('does not call Shopify when there is nothing to change', async () => {
    const client = makeClient(okVariantUpdate);

    const result = await updateVariantInShopify(client, { retailVariantId: VARIANT_ID }, {});

    expect(result).toBeNull();
    expect(client.calls).toHaveLength(0);
  });

  it('surfaces a Shopify userError as a 422', async () => {
    const client = makeClient({
      data: { productVariantsBulkUpdate: { userErrors: [{ message: 'Price must be positive' }] } }
    });

    await expect(
      updateVariantInShopify(client, { retailVariantId: VARIANT_ID }, { price: '-1', productId: PRODUCT_ID })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('surfaces a top-level GraphQL error as a 502', async () => {
    const client = makeClient({ errors: [{ message: 'bad field' }] });

    await expect(
      updateVariantInShopify(client, { retailVariantId: VARIANT_ID }, { price: '1', productId: PRODUCT_ID })
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('updateProductDetails', () => {
  it('writes title and descriptionHtml, both valid ProductInput fields', async () => {
    const client = makeClient(okProductUpdate);

    await updateProductDetails(client, PRODUCT_ID, { title: 'Apples', descriptionHtml: 'Tasty' });

    expect(client.calls[0].variables.input).toEqual({
      id: `gid://shopify/Product/${PRODUCT_ID}`,
      title: 'Apples',
      descriptionHtml: 'Tasty'
    });
  });

  it('clears a field when explicitly null (PUT semantics)', async () => {
    const client = makeClient(okProductUpdate);

    await updateProductDetails(client, PRODUCT_ID, { descriptionHtml: null });

    expect(client.calls[0].variables.input.descriptionHtml).toBe('');
  });

  it('does not call Shopify when there is nothing to change', async () => {
    const client = makeClient(okProductUpdate);

    expect(await updateProductDetails(client, PRODUCT_ID, {})).toBeNull();
    expect(client.calls).toHaveLength(0);
  });
});

describe('findVariant', () => {
  it('returns null when the variant does not exist', async () => {
    const client = makeClient({ data: { node: null } });

    expect(await findVariant(client, PRODUCT_ID, VARIANT_ID)).toBeNull();
  });

  it('rejects a variant that belongs to a different product', async () => {
    // Regression guard: the original only checked the variant existed, so a
    // payload naming a real variant from product A with a real parent B
    // produced a mapping that could never resolve.
    const client = makeClient({
      data: {
        node: {
          id: 'gid://shopify/ProductVariant/4242',
          product: { id: 'gid://shopify/Product/1234' }
        }
      }
    });

    await expect(findVariant(client, PRODUCT_ID, VARIANT_ID))
      .rejects.toMatchObject({ status: 409 });
  });

  it('accepts a variant that belongs to the named product', async () => {
    const client = makeClient({
      data: {
        node: {
          id: 'gid://shopify/ProductVariant/4242',
          product: { id: `gid://shopify/Product/${PRODUCT_ID}` }
        }
      }
    });

    const variant = await findVariant(client, PRODUCT_ID, VARIANT_ID);

    expect(variant).toMatchObject({ id: '4242', productId: String(PRODUCT_ID) });
  });
});

describe('findShopCurrency', () => {
  it('returns the shop currency code', async () => {
    const client = makeClient({ data: { shop: { currencyCode: 'GBP' } } });

    expect(await findShopCurrency(client)).toBe('GBP');
  });

  it('returns null when the shop has no currency', async () => {
    const client = makeClient({ data: { shop: null } });

    expect(await findShopCurrency(client)).toBeNull();
  });
});