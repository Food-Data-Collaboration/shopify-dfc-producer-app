import { useEffect, useState } from 'react';
import { extractShopName } from '../utils/shopUtils';

function createScript(url, onload) {
  const script = document.createElement('script');
  script.src = url;
  script.type = 'module';
  script.onload = onload;
  document.body.appendChild(script);
}

export default function PlatformAuthorisation() {
  const [ready, setReady] = useState(false);

  const shopName = extractShopName();

  useEffect(() => {
    createScript(
      'https://cdn.jsdelivr.net/npm/@startinblox/core@latest/dist/index.js',
      () => {
        createScript(
          'https://cdn.jsdelivr.net/npm/@startinblox/solid-data-permissioning@latest/dist/index.js',
          () => setReady(true)
        );
      }
    );
  }, []);

  if (!ready) { return null; }

  return (
    <div>
      <h1>Test!</h1>
      <solid-permissioning
        data-src={`/api/dfc/Enterprises/${shopName}/Portals`}
        scopes-uri="/api/scopes"
        noRouter
      />
    </div>
  );
}
