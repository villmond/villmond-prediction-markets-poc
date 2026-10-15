import { useEffect, useMemo, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { BetPlacementParams } from "@villmond/nostr/marketEvents.js";
import type { MarketPayoutParams } from "@villmond/nostr/payout.js";

export interface BalanceEstimate {
  startingBalance: number;
  totalStaked: number;
  betCount: number;
  totalPayouts: number;
  payoutCount: number;
  /** startingBalance - totalStaked + totalPayouts. See the Balance tab's own caveat: payouts only count if the resolving oracle actually published a kind:7002 payout event (see payout.ts) — a signed claim, not something enforced on-chain. */
  estimatedBalance: number;
}

/**
 * Reconstructs a rough VILCOIN balance from the signed events that exist
 * for it: the user's own kind:7001 bet placements (debits) and kind:7002
 * payout records naming them as a recipient (credits), relative to the
 * configured starting grant. Still an estimate, not a ledger — see
 * `BalanceEstimate.estimatedBalance`'s doc comment.
 */
export function useBalance(
  client: MarketRelayClient | null,
  publicKeyHex: string | undefined,
  startingBalance: number,
): BalanceEstimate {
  const [bets, setBets] = useState<BetPlacementParams[]>([]);
  const [payoutAmounts, setPayoutAmounts] = useState<number[]>([]);

  useEffect(() => {
    setBets([]);
    setPayoutAmounts([]);
    if (!client || !publicKeyHex) return;

    const seenBets = new Set<string>();
    const betSub = client.subscribeToOwnBets(publicKeyHex, (bet, event) => {
      if (seenBets.has(event.id)) return;
      seenBets.add(event.id);
      setBets((prev) => [...prev, bet]);
    });

    const seenPayouts = new Set<string>();
    const payoutSub = client.subscribeToPayouts(publicKeyHex, (payout: MarketPayoutParams, event) => {
      if (seenPayouts.has(event.id)) return;
      seenPayouts.add(event.id);
      const mine = payout.recipients.filter((r) => r.pubkey === publicKeyHex);
      const amount = mine.reduce((sum, r) => sum + r.amount, 0);
      if (amount > 0) setPayoutAmounts((prev) => [...prev, amount]);
    });

    return () => {
      betSub.close();
      payoutSub.close();
    };
  }, [client, publicKeyHex]);

  return useMemo(() => {
    const totalStaked = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const totalPayouts = payoutAmounts.reduce((sum, amount) => sum + amount, 0);
    return {
      startingBalance,
      totalStaked,
      betCount: bets.length,
      totalPayouts,
      payoutCount: payoutAmounts.length,
      estimatedBalance: startingBalance - totalStaked + totalPayouts,
    };
  }, [bets, payoutAmounts, startingBalance]);
}
