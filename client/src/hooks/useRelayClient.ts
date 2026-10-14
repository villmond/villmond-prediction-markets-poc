import { useEffect, useState } from "react";
import { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { Event as NostrEvent } from "nostr-tools";

/**
 * Owns a single `MarketRelayClient` (one WebSocket pool) per relay list,
 * shared by every hook that needs it — subscribing to markets and to
 * Cashier orders over the same connections rather than each opening its
 * own pool to the same relays.
 */
export function useRelayClient(relays: string[]): MarketRelayClient | null {
  const [client, setClient] = useState<MarketRelayClient | null>(null);
  const relaysKey = relays.join(",");

  useEffect(() => {
    if (relays.length === 0) {
      setClient(null);
      return;
    }

    const next = new MarketRelayClient(relays);
    setClient(next);

    return () => next.close();
    // relaysKey captures the same information as `relays` in a stable, comparable form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relaysKey]);

  return client;
}

/** Publishes an event and reports whether at least one relay accepted it; never throws. */
export async function publishEvent(client: MarketRelayClient | null, event: NostrEvent): Promise<boolean> {
  if (!client) return false;

  const results = await Promise.allSettled(client.publish(event));
  const accepted = results.some((r) => r.status === "fulfilled");
  if (!accepted) {
    console.error("Failed to publish event to any relay", event.id, results);
  }
  return accepted;
}
