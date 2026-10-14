import { useEffect, useMemo, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import { computeOracleReputation, type OracleRating, type OracleReputation } from "@villmond/nostr/oracleReputation.js";

/** Subscribes to kind:1985 ratings for one oracle and aggregates them live (PRD 5.4). */
export function useOracleReputation(
  client: MarketRelayClient | null,
  oraclePublicKey: string | undefined,
): OracleReputation | undefined {
  const [ratings, setRatings] = useState<OracleRating[]>([]);

  useEffect(() => {
    if (!client || !oraclePublicKey) {
      setRatings([]);
      return;
    }

    const sub = client.subscribeToOracleRatings(oraclePublicKey, (rating) => {
      setRatings((prev) => [...prev.filter((r) => r.raterPublicKey !== rating.raterPublicKey), rating]);
    });

    return () => sub.close();
  }, [client, oraclePublicKey]);

  return useMemo(
    () => (oraclePublicKey ? computeOracleReputation(ratings, oraclePublicKey) : undefined),
    [ratings, oraclePublicKey],
  );
}
