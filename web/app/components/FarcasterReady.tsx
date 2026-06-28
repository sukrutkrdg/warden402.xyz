"use client";

import { useEffect } from "react";

/**
 * Signals the Farcaster / Base App client that the Mini App is ready, which
 * dismisses the splash screen. No-op outside a Mini App host. Safe everywhere.
 */
export default function FarcasterReady() {
  useEffect(() => {
    let cancelled = false;
    import("@farcaster/miniapp-sdk")
      .then(({ sdk }) => {
        if (!cancelled) sdk.actions.ready().catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
