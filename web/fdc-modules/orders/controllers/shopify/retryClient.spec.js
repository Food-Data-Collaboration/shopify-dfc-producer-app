import { requestWithRetry } from './retryClient.js';

function fakeClient(responseFactory) {
  let callCount = 0;
  return {
    _callCount: () => callCount,
    request: async () => {
      callCount++;
      return responseFactory(callCount);
    },
  };
}

describe('retryClient', () => {
  it('returns response on first success', async () => {
    const client = fakeClient(() => ({ data: { ok: true } }));
    const result = await requestWithRetry(client, 'query { x }');
    expect(result).toEqual({ data: { ok: true } });
    expect(client._callCount()).toBe(1);
  });

  it('retries on throttled response then succeeds', async () => {
    const client = fakeClient((n) => {
      if (n <= 2) return { errors: [{ extensions: { code: 'THROTTLED' } }] };
      return { data: { ok: true } };
    });
    const result = await requestWithRetry(client, 'query { x }');
    expect(result).toEqual({ data: { ok: true } });
    expect(client._callCount()).toBe(3);
  }, 15000);

  it('throws after exhausting retries on throttled', async () => {
    const client = fakeClient(() => ({
      errors: [{ extensions: { code: 'THROTTLED' } }],
    }));
    await expect(
      requestWithRetry(client, 'query { x }'),
    ).rejects.toThrow('Shopify rate limit exceeded after all retries');
    expect(client._callCount()).toBe(4);
  }, 30000);

  it('retries on thrown errors then succeeds', async () => {
    const client = fakeClient((n) => {
      if (n <= 2) throw new Error('Network error');
      return { data: { ok: true } };
    });
    const result = await requestWithRetry(client, 'query { x }');
    expect(result).toEqual({ data: { ok: true } });
    expect(client._callCount()).toBe(3);
  }, 15000);
});
