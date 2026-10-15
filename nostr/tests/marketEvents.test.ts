import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools";
import {
  BET_PLACEMENT_KIND,
  MARKET_CREATION_KIND,
  UNCATEGORIZED_CATEGORY,
  buildBetPlacementEvent,
  buildMarketCreationEvent,
  buildMarketRetractionEvent,
  isMarketRetraction,
  parseBetPlacementEvent,
  parseMarketCreationEvent,
} from "../src/marketEvents.js";

describe("market creation events", () => {
  it("builds a signed, verifiable kind:30000 event round-tripping all fields", () => {
    const secretKey = generateSecretKey();
    const params = {
      marketId: "market-abc123",
      question: "Will it rain in SF by Friday?",
      outcomeType: "binary" as const,
      outcomes: ["Yes", "No"],
      metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      closesAt: 1_900_000_000,
      category: "sports",
    };

    const event = buildMarketCreationEvent(params, secretKey);

    expect(event.kind).toBe(MARKET_CREATION_KIND);
    expect(event.sig).toBeDefined();
    expect(parseMarketCreationEvent(event)).toEqual(params);
  });

  it("round-trips the optional ledger/settlement zkApp addresses and image CID when present", () => {
    const secretKey = generateSecretKey();
    const params = {
      marketId: "market-onchain-1",
      question: "Will it rain in SF by Friday?",
      outcomeType: "binary" as const,
      outcomes: ["Yes", "No"],
      metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      closesAt: 1_900_000_000,
      category: "technology",
      imageCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fimg",
      ledgerAddress: "B62qpPj4XJZHCAuya2Q6JkZNRVcVSDnEDAfQkeqoAdVDvTmV23mHcUg",
      settlementAddress: "B62qkYa1o6Mj6uTTjDqF2EkV9bcKbDU1D1V5BkQi5c8sQK5tR5qbW8W",
    };

    const event = buildMarketCreationEvent(params, secretKey);

    expect(parseMarketCreationEvent(event)).toEqual(params);
  });

  it("defaults the category to uncategorized when a pre-existing market event has no category tag", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketCreationEvent(
      {
        marketId: "market-legacy",
        question: "q",
        outcomeType: "binary",
        outcomes: ["Yes", "No"],
        metadataCid: "bafy",
        closesAt: 1_900_000_000,
        category: "politics",
      },
      secretKey,
    );
    const tampered = { ...event, tags: event.tags.filter((t) => t[0] !== "category") };

    expect(parseMarketCreationEvent(tampered).category).toBe(UNCATEGORIZED_CATEGORY);
  });

  it("rejects an empty question", () => {
    const secretKey = generateSecretKey();
    expect(() =>
      buildMarketCreationEvent(
        { marketId: "x", question: "  ", outcomeType: "binary", outcomes: ["Yes", "No"], metadataCid: "bafy", closesAt: 1_900_000_000, category: "sports" },
        secretKey,
      ),
    ).toThrow(/question/);
  });

  it("rejects fewer than two outcomes", () => {
    const secretKey = generateSecretKey();
    expect(() =>
      buildMarketCreationEvent(
        { marketId: "x", question: "q", outcomeType: "binary", outcomes: ["Yes"], metadataCid: "bafy", closesAt: 1_900_000_000, category: "sports" },
        secretKey,
      ),
    ).toThrow(/outcomes/);
  });

  it("rejects a closesAt timestamp in the past", () => {
    const secretKey = generateSecretKey();
    expect(() =>
      buildMarketCreationEvent(
        { marketId: "x", question: "q", outcomeType: "binary", outcomes: ["Yes", "No"], metadataCid: "bafy", closesAt: 1, category: "sports" },
        secretKey,
      ),
    ).toThrow(/closesAt/);
  });

  it("rejects an empty category", () => {
    const secretKey = generateSecretKey();
    expect(() =>
      buildMarketCreationEvent(
        { marketId: "x", question: "q", outcomeType: "binary", outcomes: ["Yes", "No"], metadataCid: "bafy", closesAt: 1_900_000_000, category: "  " },
        secretKey,
      ),
    ).toThrow(/category/);
  });
});

describe("market retraction", () => {
  it("builds a kind:30000 retraction republishing the same d tag", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketRetractionEvent("market-abc123", secretKey);

    expect(event.kind).toBe(MARKET_CREATION_KIND);
    expect(event.tags).toEqual(expect.arrayContaining([["d", "market-abc123"]]));
    expect(isMarketRetraction(event)).toBe(true);
  });

  it("does not flag a normal, live market as a retraction", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketCreationEvent(
      {
        marketId: "market-abc123",
        question: "q",
        outcomeType: "binary",
        outcomes: ["Yes", "No"],
        metadataCid: "bafy",
        closesAt: 1_900_000_000,
        category: "sports",
      },
      secretKey,
    );

    expect(isMarketRetraction(event)).toBe(false);
  });

  it("rejects parsing a retraction as a live market, since it carries none of the required fields", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketRetractionEvent("market-abc123", secretKey);

    expect(() => parseMarketCreationEvent(event)).toThrow(/missing required tags/);
  });
});

describe("bet placement events", () => {
  it("builds a signed kind:7001 event round-tripping all fields", () => {
    const secretKey = generateSecretKey();
    const params = {
      marketEventId: "a".repeat(64),
      outcomeIndex: 1,
      amount: 250,
    };

    const event = buildBetPlacementEvent(params, secretKey);

    expect(event.kind).toBe(BET_PLACEMENT_KIND);
    expect(event.sig).toBeDefined();
    expect(parseBetPlacementEvent(event)).toEqual(params);
  });
});
