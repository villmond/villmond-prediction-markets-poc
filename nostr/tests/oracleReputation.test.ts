import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  ORACLE_RATING_KIND,
  buildOracleRatingEvent,
  computeOracleReputation,
  parseOracleRatingEvent,
} from "../src/oracleReputation.js";

describe("oracle rating events", () => {
  it("builds a signed kind:1985 event round-tripping oracle/score/review", () => {
    const secretKey = generateSecretKey();
    const oraclePublicKey = getPublicKey(generateSecretKey());

    const event = buildOracleRatingEvent({ oraclePublicKey, score: 4, review: "Resolved fairly" }, secretKey);

    expect(event.kind).toBe(ORACLE_RATING_KIND);
    const parsed = parseOracleRatingEvent(event);
    expect(parsed).toMatchObject({ oraclePublicKey, score: 4, review: "Resolved fairly" });
    expect(parsed.raterPublicKey).toBe(getPublicKey(secretKey));
  });

  it("rejects an out-of-range score", () => {
    const secretKey = generateSecretKey();
    expect(() => buildOracleRatingEvent({ oraclePublicKey: "abc", score: 6 }, secretKey)).toThrow();
  });
});

describe("computeOracleReputation", () => {
  const oraclePublicKey = "oracle-under-test";

  function rating(raterPublicKey: string, score: number, createdAt: number): ReturnType<typeof parseOracleRatingEvent> {
    return { raterPublicKey, oraclePublicKey, score, review: "", createdAt };
  }

  it("averages scores across distinct raters", () => {
    const rep = computeOracleReputation(
      [rating("rater-a", 5, 100), rating("rater-b", 3, 101), rating("rater-c", 4, 102)],
      oraclePublicKey,
    );

    expect(rep.ratingCount).toBe(3);
    expect(rep.averageScore).toBeCloseTo(4);
    expect(rep.meetsThreshold(3.0)).toBe(true);
    expect(rep.meetsThreshold(4.5)).toBe(false);
  });

  it("keeps only each rater's most recent rating", () => {
    const rep = computeOracleReputation(
      [rating("rater-a", 1, 100), rating("rater-a", 5, 200)],
      oraclePublicKey,
    );

    expect(rep.ratingCount).toBe(1);
    expect(rep.averageScore).toBe(5);
  });

  it("ignores ratings for other oracles and reports zero with no data", () => {
    const rep = computeOracleReputation([rating("rater-a", 5, 100)], "a-different-oracle");

    expect(rep.ratingCount).toBe(0);
    expect(rep.averageScore).toBe(0);
    expect(rep.meetsThreshold(0)).toBe(false);
  });
});
