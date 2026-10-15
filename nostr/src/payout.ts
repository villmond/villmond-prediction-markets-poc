import { finalizeEvent, type EventTemplate, type Event as NostrEvent } from "nostr-tools";

/**
 * Market payout record, published by the resolving oracle alongside (not
 * instead of) the on-chain `MarketSettlement.resolveMarket()` call. Fills
 * the gap flagged in the Balance tab: `VilcoinLedger` tracks AMM pool
 * reserves, not individual positions, so there is no on-chain record of
 * who is owed what. Like every other VILCOIN balance change in this app
 * (bet placement included), this is a signed off-chain claim, not a
 * cryptographically enforced one — consistent with the existing
 * closed-loop-credit-via-Nostr-events design, not a new trust model.
 */
export const MARKET_PAYOUT_KIND = 7002;

export interface PayoutRecipient {
  pubkey: string;
  amount: number;
}

export interface MarketPayoutParams {
  /** Event id of the `MARKET_CREATION_KIND` event this payout settles. */
  marketEventId: string;
  winningOutcome: number;
  recipients: PayoutRecipient[];
}

/**
 * Computes each winning bettor's proportional share of the resolved pool,
 * minus the platform admin fee (`adminFeeBps`, default 250 = 2.5%, matching
 * `MarketSettlement`'s on-chain `ADMIN_FEE_BPS`). Pure function so it can be
 * unit-tested directly — the caller (`ResolveMarketPanel`) only owns the
 * chain/relay I/O around it. Bettors with no stake on the winning outcome
 * are simply absent from the result, not zero-amount entries.
 */
export function computePayoutShares(
  bets: { pubkey: string; outcomeIndex: number; amount: number }[],
  winningOutcome: number,
  totalPoolAmount: number,
  adminFeeBps = 250n,
): PayoutRecipient[] {
  const stakedByPubkey = new Map<string, number>();
  for (const bet of bets) {
    if (bet.outcomeIndex !== winningOutcome) continue;
    stakedByPubkey.set(bet.pubkey, (stakedByPubkey.get(bet.pubkey) ?? 0) + bet.amount);
  }

  const totalWinningStake = [...stakedByPubkey.values()].reduce((sum, amount) => sum + amount, 0);
  if (totalWinningStake === 0) return [];

  const netPool = totalPoolAmount - Number((BigInt(Math.round(totalPoolAmount)) * adminFeeBps) / 10_000n);
  return [...stakedByPubkey.entries()].map(([pubkey, staked]) => ({
    pubkey,
    amount: Math.floor((staked / totalWinningStake) * netPool),
  }));
}

export function buildMarketPayoutEvent(params: MarketPayoutParams, secretKey: Uint8Array): NostrEvent {
  if (params.recipients.length === 0) {
    throw new Error("recipients must not be empty");
  }
  for (const recipient of params.recipients) {
    if (!Number.isFinite(recipient.amount) || recipient.amount <= 0) {
      throw new Error(`Invalid payout amount for ${recipient.pubkey}: ${recipient.amount}`);
    }
  }

  const template: EventTemplate = {
    kind: MARKET_PAYOUT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", params.marketEventId],
      ["outcome", String(params.winningOutcome)],
      ...params.recipients.map((recipient): [string, string] => ["p", recipient.pubkey]),
    ],
    content: JSON.stringify(params.recipients),
  };

  return finalizeEvent(template, secretKey);
}

export function parseMarketPayoutEvent(event: NostrEvent): MarketPayoutParams {
  if (event.kind !== MARKET_PAYOUT_KIND) {
    throw new Error(`Expected kind ${MARKET_PAYOUT_KIND}, got ${event.kind}`);
  }

  const getTag = (name: string): string | undefined => event.tags.find((t) => t[0] === name)?.[1];
  const marketEventId = getTag("e");
  const outcomeTag = getTag("outcome");
  if (!marketEventId || outcomeTag === undefined) {
    throw new Error("Market payout event is missing required tags");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    throw new Error("Market payout event has malformed JSON content");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Market payout event content must be an array");
  }
  for (const entry of parsed) {
    const recipient = entry as Partial<PayoutRecipient>;
    if (typeof recipient !== "object" || recipient === null || typeof recipient.pubkey !== "string" || typeof recipient.amount !== "number") {
      throw new Error("Market payout event contains a malformed recipient");
    }
  }

  return {
    marketEventId,
    winningOutcome: Number(outcomeTag),
    recipients: parsed as PayoutRecipient[],
  };
}
