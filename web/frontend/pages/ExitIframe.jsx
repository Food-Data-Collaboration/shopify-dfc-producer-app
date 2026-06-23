import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Spinner } from "@shopify/polaris";

export default function ExitIframe() {
  const { search } = useLocation();

  useEffect(() => {
    if (!!search) {
      const params = new URLSearchParams(search);
      const redirectUri = params.get("redirectUri");
      const url = new URL(decodeURIComponent(redirectUri));

      if (url.hostname === location.hostname) {
        window.location.href = decodeURIComponent(redirectUri);
      }
    }
  }, [search]);

  return <Spinner />;
}
