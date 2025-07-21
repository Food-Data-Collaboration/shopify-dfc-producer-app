import { useEffect, useState } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { getSessionToken } from '@shopify/app-bridge-utils';

function createScript(url, onload) {
  const script = document.createElement('script');
  script.src = url;
  script.type = 'module';
  script.onload = onload;
  document.body.appendChild(script);
}

export default function PlatformAuthorisation({ shopName }) {
  const [ready, setReady] = useState(false);
  const [authToken, setAuthToken] = useState();
  const app = useAppBridge();

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

  useEffect(() => {
    async function getToken() {
      const token = await getSessionToken(app);
      setAuthToken(token);
    }
    getToken();
  }, [app]);

  if (!ready || !authToken) { return null; }

  return (
    <div>
      <solid-permissioning
        data-src={`https://${window.location.host}/api/dfc/Enterprises/${shopName}/Portals`}
        scopes-uri="https://cdn.startinblox.com/owl/dfc/taxonomies/scopes.jsonld"
        auto-lang
        noRouter
        auth-token={authToken}
      />
    </div>
  );
}
