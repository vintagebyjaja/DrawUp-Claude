"use client";

import { useEffect, useState } from "react";

// The site lives in public/drawup-preview.html. Pass the address-bar hash and
// query through to it so Supabase email-confirmation / magic-link tokens
// (#access_token=… or ?code=…) and deep links like #portal/profile reach the
// page that actually runs DrawUp, instead of being dropped by the iframe.
// Read once: React may run effects twice in development.
let initialSuffix: string | null = null;

export default function Home() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    initialSuffix ??= window.location.search + window.location.hash;
    setSrc("/drawup-preview.html" + initialSuffix);
    // Don't leave one-time auth tokens sitting in the address bar.
    if (/access_token|refresh_token|[?&]code=/.test(initialSuffix)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  if (!src) return null;
  return (
    <iframe
      title="DrawUp Season 1"
      src={src}
      style={{ width: "100%", height: "100dvh", border: 0, display: "block" }}
    />
  );
}
