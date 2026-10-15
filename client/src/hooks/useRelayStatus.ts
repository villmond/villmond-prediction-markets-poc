import { useEffect, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";

const POLL_INTERVAL_MS = 3000;

/** Polls the shared relay client's real per-relay connection state (Expert panel's status dots). */
export function useRelayStatus(client: MarketRelayClient | null): Map<string, boolean> {
  const [status, setStatus] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!client) {
      setStatus(new Map());
      return;
    }

    const poll = () => setStatus(client.getConnectionStatus());
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [client]);

  return status;
}
