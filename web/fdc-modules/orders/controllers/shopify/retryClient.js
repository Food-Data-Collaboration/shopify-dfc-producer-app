const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottled(responseOrError) {
  if (!responseOrError) return false;
  const errors = responseOrError.errors
    || responseOrError.response?.errors
    || [];
  return errors.some(
    (err) =>
      err.extensions?.code === 'THROTTLED' ||
      err.message?.toLowerCase().includes('throttled'),
  );
}

export async function requestWithRetry(client, query, options = {}) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.request(query, options);

      if (isThrottled(response)) {
        if (attempt < MAX_RETRIES) {
          const wait = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
          console.warn(
            `Shopify rate limit hit, retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await delay(wait);
          continue;
        }
        throw new Error('Shopify rate limit exceeded after all retries');
      }

      return response;
    } catch (err) {
      if (isThrottled(err)) {
        if (attempt < MAX_RETRIES) {
          const wait = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
          console.warn(
            `Shopify rate limit hit, retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await delay(wait);
          continue;
        }
        throw new Error('Shopify rate limit exceeded after all retries');
      }

      if (attempt < MAX_RETRIES) {
        const wait = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
        console.warn(
          `Shopify request failed (${err.message}), retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await delay(wait);
        lastError = err;
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('Request failed after all retries');
}
