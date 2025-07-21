import { useEffect, useState } from 'react';

function createScript(url, onload) {
  const script = document.createElement('script');
  script.src = url;
  script.type = 'module';
  script.onload = onload;
  document.body.appendChild(script);
}

export default function PlatformAuthorisation({ shopName }) {
  const [ready, setReady] = useState(false);
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
      <solid-permissioning
        data-src={`https://${window.location.host}/api/dfc/Enterprises/${shopName}/Portals`}
        scopes-uri={`https://${window.location.host}/api/scopes`}
        noRouter
      />
    </div>
  );
}
