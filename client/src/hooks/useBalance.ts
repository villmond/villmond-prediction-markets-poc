import { useEffect, useMemo, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { BetPlacementParams } from "@villmond/nostr/marketEvents.js";

export interface BalanceEstimate {
  startingBalance: number;
  totalStaked: number;
  betCount: number;
  /** startingBalance - totalStaked. See the Balance tab's own caveat: this does not include resolved-market payouts (nothing currently publishes a per-bettor payout event — see README's architecture notes). */
  estimatedBalance: number;
}

/**
 * Reconstructs a rough VILCOIN balance from the only signed events that
 * actually exist for it today: the user's own kind:7001 bet placements,
 * subtracted from the configured starting grant. Deliberately not a true
 * balance — see `BalanceEstimate.estimatedBalance`'s doc comment.
 */
export function useBalance(
  client: MarketRelayClient | null,
  publicKeyHex: string | undefined,
  startingBalance: number,
): BalanceEstimate {
  const [bets, setBets] = useState<BetPlacementParams[]>([]);

  useEffect(() => {
    setBets([]);
    if (!client || !publicKeyHex) return;

    const seen = new Set<string>();
    const sub = client.subscribeToOwnBets(publicKeyHex, (bet, event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      setBets((prev) => [...prev, bet]);
    });

    return () => sub.close();
  }, [client, publicKeyHex]);

  return useMemo(() => {
    const totalStaked = bets.reduce((sum, bet) => sum + bet.amount, 0);
    return {
      startingBalance,
      totalStaked,
      betCount: bets.length,
      estimatedBalance: startingBalance - totalStaked,
    };
  }, [bets, startingBalance]);
}
