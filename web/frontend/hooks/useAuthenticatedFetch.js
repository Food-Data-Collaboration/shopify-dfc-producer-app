function checkHeadersForReauthorization(headers) {
  if (headers.get('X-Shopify-API-Request-Failure-Reauthorize') === '1') {
    const authUrlHeader =
      headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url') ||
      '/api/auth';

    const url = authUrlHeader.startsWith('/')
      ? `https://${window.location.host}${authUrlHeader}`
      : authUrlHeader;

    window.top.location.href = url;
  }
}

/**
 * A hook that returns an auth-aware fetch function.
 * App Bridge v4 CDN auto-injects auth headers into all fetch calls.
 * This wrapper handles reauthorization redirects if the session expires.
 *
 * @returns {Function} fetch function
 */
export function useAuthenticatedFetch() {
  return async (uri, options) => {
    const response = await fetch(uri, options);
    checkHeadersForReauthorization(response.headers);
    return response;
  };
}

export default useAuthenticatedFetch;
