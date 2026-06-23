import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Spinner } from "@shopify/polaris";

export default function ExitIframe() {
  const { search } = useLocation();

  useEffect(() => {
    if (!search) return;

    const params = new URLSearchParams(search);
    const redirectUri = params.get("redirectUri");
    if (!redirectUri) return;

    try {
      const url = new URL(decodeURIComponent(redirectUri));
      if (url.hostname === window.location.hostname) {
        window.location.href = url.toString();
      }
    } catch {
      // Invalid redirect URI — nothing to do
    }
  }, [search]);

  return <Spinner />;
}
