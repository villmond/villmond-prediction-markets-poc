import { finalizeEvent, type EventTemplate, type Event as NostrEvent } from "nostr-tools";

/**
 * Oracle rating event kind, per PRD 5.4 ("kind: 1985 or custom schema").
 * Reuses kind 1985 with this app's own tag schema rather than full NIP-32
 * label compliance, which is out of scope for this POC.
 */
export const ORACLE_RATING_KIND = 1985;

export interface RateOracleParams {
  oraclePublicKey: string;
  /** Integer rating from 1 (worst) to 5 (best). */
  score: number;
  review?: string;
}

export interface OracleRating {
  raterPublicKey: string;
  oraclePublicKey: string;
  score: number;
  review: string;
  createdAt: number;
}

export interface OracleReputation {
  oraclePublicKey: string;
  averageScore: number;
  ratingCount: number;
  meetsThreshold(minReputationThreshold: number): boolean;
}

export function buildOracleRatingEvent(params: RateOracleParams, secretKey: Uint8Array): NostrEvent {
  if (!Number.isInteger(params.score) || params.score < 1 || params.score > 5) {
    throw new Error("score must be an integer between 1 and 5");
  }

  const template: EventTemplate = {
    kind: ORACLE_RATING_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", params.oraclePublicKey],
      ["score", String(params.score)],
    ],
    content: params.review ?? "",
  };

  return finalizeEvent(template, secretKey);
}

export function parseOracleRatingEvent(event: NostrEvent): OracleRating {
  if (event.kind !== ORACLE_RATING_KIND) {
    throw new Error(`Expected kind ${ORACLE_RATING_KIND}, got ${event.kind}`);
  }

  const oraclePublicKey = event.tags.find((t) => t[0] === "p")?.[1];
  const scoreTag = event.tags.find((t) => t[0] === "score")?.[1];

  if (!oraclePublicKey || scoreTag === undefined) {
    throw new Error("Oracle rating event is missing required tags");
  }

  return {
    raterPublicKey: event.pubkey,
    oraclePublicKey,
    score: Number(scoreTag),
    review: event.content,
    createdAt: event.created_at,
  };
}

/**
 * Aggregates an oracle's reliability score from its rating events.
 *
 * Keeps only each rater's most recent rating before averaging, so a single
 * rater re-publishing the same opinion repeatedly cannot inflate (or
 * deflate) the aggregate — a minimal Sybil guard appropriate for this POC's
 * trust model (PRD 5.4: "The client computes an aggregated reliability score").
 */
export function computeOracleReputation(ratings: OracleRating[], oraclePublicKey: string): OracleReputation {
  const latestByRater = new Map<string, OracleRating>();

  for (const rating of ratings) {
    if (rating.oraclePublicKey !== oraclePublicKey) continue;
    const existing = latestByRater.get(rating.raterPublicKey);
    if (!existing || rating.createdAt > existing.createdAt) {
      latestByRater.set(rating.raterPublicKey, rating);
    }
  }

  const deduped = [...latestByRater.values()];
  const ratingCount = deduped.length;
  const averageScore = ratingCount === 0 ? 0 : deduped.reduce((sum, r) => sum + r.score, 0) / ratingCount;

  return {
    oraclePublicKey,
    averageScore,
    ratingCount,
    meetsThreshold(minReputationThreshold: number) {
      return ratingCount > 0 && averageScore >= minReputationThreshold;
    },
  };
}
