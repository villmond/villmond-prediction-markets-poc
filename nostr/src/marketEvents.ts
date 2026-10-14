import { finalizeEvent, type EventTemplate, type Event as NostrEvent } from "nostr-tools";

/**
 * Parametrized-replaceable event kind for market creation, per PRD 5.3/10.
 * Follows the NIP-01 "parametrized replaceable" range (30000-39999); the
 * market's unique id is carried in the required `d` tag.
 */
export const MARKET_CREATION_KIND = 30000;

/**
 * Application-specific regular event kind for bet placements. Not part of
 * an existing NIP; scoped to this app's event namespace.
 */
export const BET_PLACEMENT_KIND = 7001;

export type MarketOutcomeType = "binary" | "multi";

export interface CreateMarketParams {
  /** Stable unique id for this market, used as the replaceable event's `d` tag. */
  marketId: string;
  question: string;
  outcomeType: MarketOutcomeType;
  /** Outcome labels, e.g. ["Yes", "No"] or a custom multi-choice list. */
  outcomes: string[];
  /** CID of the full market metadata/resolution-rules document pinned to IPFS. */
  metadataCid: string;
  /** Unix timestamp (seconds) after which the market can no longer accept bets. */
  closesAt: number;
  /** Deployed `VilcoinLedger` zkApp address (base58) backing this market's AMM pool, if any. */
  ledgerAddress?: string;
  /** Deployed `MarketSettlement` zkApp address (base58) for this market, if any. */
  settlementAddress?: string;
}

export interface BetPlacementParams {
  /** Event id of the `MARKET_CREATION_KIND` event this bet targets. */
  marketEventId: string;
  /** Index into the market's `outcomes` array. */
  outcomeIndex: number;
  /** VILCOIN stake amount, in whole token units. */
  amount: number;
}

function toEventTemplate(kind: number, tags: string[][], content: string): EventTemplate {
  return {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
}

/** Builds and signs a market-creation event ready to publish to Nostr relays. */
export function buildMarketCreationEvent(params: CreateMarketParams, secretKey: Uint8Array): NostrEvent {
  if (!params.question.trim()) {
    throw new Error("question must not be empty");
  }
  if (params.outcomes.length < 2 || params.outcomes.some((o) => !o.trim())) {
    throw new Error("outcomes must contain at least 2 non-empty options");
  }
  if (!Number.isFinite(params.closesAt) || params.closesAt * 1000 <= Date.now()) {
    throw new Error("closesAt must be a future unix timestamp (seconds)");
  }

  const tags: string[][] = [
    ["d", params.marketId],
    ["title", params.question],
    ["outcome_type", params.outcomeType],
    ["ipfs_cid", params.metadataCid],
    ["closes_at", String(params.closesAt)],
    ...params.outcomes.map((outcome, index) => ["outcome", String(index), outcome]),
    ...(params.ledgerAddress ? [["ledger_address", params.ledgerAddress]] : []),
    ...(params.settlementAddress ? [["settlement_address", params.settlementAddress]] : []),
  ];

  const template = toEventTemplate(MARKET_CREATION_KIND, tags, params.question);
  return finalizeEvent(template, secretKey);
}

/** Builds and signs a bet-placement event referencing an existing market event. */
export function buildBetPlacementEvent(params: BetPlacementParams, secretKey: Uint8Array): NostrEvent {
  if (!Number.isInteger(params.outcomeIndex) || params.outcomeIndex < 0) {
    throw new Error("outcomeIndex must be a non-negative integer");
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("amount must be a positive, finite number");
  }

  const tags: string[][] = [
    ["e", params.marketEventId],
    ["outcome_index", String(params.outcomeIndex)],
    ["amount", String(params.amount)],
  ];

  const template = toEventTemplate(BET_PLACEMENT_KIND, tags, "");
  return finalizeEvent(template, secretKey);
}

/** Extracts the structured market-creation fields back out of a signed event. */
export function parseMarketCreationEvent(event: NostrEvent): CreateMarketParams {
  if (event.kind !== MARKET_CREATION_KIND) {
    throw new Error(`Expected kind ${MARKET_CREATION_KIND}, got ${event.kind}`);
  }

  const getTag = (name: string): string | undefined => event.tags.find((t) => t[0] === name)?.[1];

  const marketId = getTag("d");
  const outcomeType = getTag("outcome_type") as MarketOutcomeType | undefined;
  const metadataCid = getTag("ipfs_cid");
  const closesAt = getTag("closes_at");

  if (!marketId || !outcomeType || !metadataCid || !closesAt) {
    throw new Error("Market creation event is missing required tags");
  }

  const outcomeTags = event.tags.filter((t) => t[0] === "outcome");
  if (outcomeTags.some((t) => t[1] === undefined || t[2] === undefined)) {
    throw new Error("Market creation event has a malformed outcome tag");
  }

  const outcomes = outcomeTags.sort((a, b) => Number(a[1]) - Number(b[1])).map((t) => t[2]);

  const ledgerAddress = getTag("ledger_address");
  const settlementAddress = getTag("settlement_address");

  return {
    marketId,
    question: event.content,
    outcomeType,
    outcomes,
    metadataCid,
    closesAt: Number(closesAt),
    ...(ledgerAddress ? { ledgerAddress } : {}),
    ...(settlementAddress ? { settlementAddress } : {}),
  };
}

/** Extracts the structured bet-placement fields back out of a signed event. */
export function parseBetPlacementEvent(event: NostrEvent): BetPlacementParams {
  if (event.kind !== BET_PLACEMENT_KIND) {
    throw new Error(`Expected kind ${BET_PLACEMENT_KIND}, got ${event.kind}`);
  }

  const getTag = (name: string): string | undefined => event.tags.find((t) => t[0] === name)?.[1];

  const marketEventId = getTag("e");
  const outcomeIndex = getTag("outcome_index");
  const amount = getTag("amount");

  if (!marketEventId || outcomeIndex === undefined || amount === undefined) {
    throw new Error("Bet placement event is missing required tags");
  }

  return {
    marketEventId,
    outcomeIndex: Number(outcomeIndex),
    amount: Number(amount),
  };
}
