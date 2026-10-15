import { useEffect, useMemo, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";

/**
 * Live unique-participant count per market (by distinct bettor pubkey),
 * tallied from a single shared kind:7001 subscription across the whole
 * markets list — one subscription total, not one per card. Counts every
 * market regardless of on-chain deployment, since a bet always publishes
 * this off-chain event (unlike on-chain pool/odds, which would need a
 * `fetchAccount` RPC call per deployed market just to render the list).
 */
export function useMarketBetCounts(client: MarketRelayClient | null): Map<string, number> {
  const [pubkeysByMarket, setPubkeysByMarket] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (!client) return;

    setPubkeysByMarket(new Map());

    const sub = client.subscribeToAllBets((bet) => {
      setPubkeysByMarket((prev) => {
        const next = new Map(prev);
        const existing = next.get(bet.marketEventId) ?? new Set<string>();
        if (existing.has(bet.pubkey)) return prev;
        const updated = new Set(existing);
        updated.add(bet.pubkey);
        next.set(bet.marketEventId, updated);
        return next;
      });
    });

    return () => sub.close();
  }, [client]);

  return useMemo(
    () => new Map([...pubkeysByMarket.entries()].map(([marketEventId, pubkeys]) => [marketEventId, pubkeys.size])),
    [pubkeysByMarket],
  );
}
