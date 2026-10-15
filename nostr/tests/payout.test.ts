import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools";
import {
  MARKET_PAYOUT_KIND,
  buildMarketPayoutEvent,
  computePayoutShares,
  parseMarketPayoutEvent,
} from "../src/payout.js";

describe("market payout events", () => {
  it("builds a signed kind:7002 event round-tripping all fields", () => {
    const secretKey = generateSecretKey();
    const params = {
      marketEventId: "market-1",
      winningOutcome: 0,
      recipients: [
        { pubkey: "alice", amount: 7312 },
        { pubkey: "bob", amount: 2437 },
      ],
    };

    const event = buildMarketPayoutEvent(params, secretKey);

    expect(event.kind).toBe(MARKET_PAYOUT_KIND);
    expect(parseMarketPayoutEvent(event)).toEqual(params);
  });

  it("rejects an empty recipients list", () => {
    const secretKey = generateSecretKey();
    expect(() => buildMarketPayoutEvent({ marketEventId: "m", winningOutcome: 0, recipients: [] }, secretKey)).toThrow(
      /recipients must not be empty/,
    );
  });

  it("rejects a non-positive or non-finite recipient amount", () => {
    const secretKey = generateSecretKey();
    expect(() =>
      buildMarketPayoutEvent({ marketEventId: "m", winningOutcome: 0, recipients: [{ pubkey: "alice", amount: 0 }] }, secretKey),
    ).toThrow(/Invalid payout amount/);
    expect(() =>
      buildMarketPayoutEvent(
        { marketEventId: "m", winningOutcome: 0, recipients: [{ pubkey: "alice", amount: Number.NaN }] },
        secretKey,
      ),
    ).toThrow(/Invalid payout amount/);
  });

  it("rejects an event missing required tags", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketPayoutEvent(
      { marketEventId: "m", winningOutcome: 0, recipients: [{ pubkey: "alice", amount: 100 }] },
      secretKey,
    );
    const tampered = { ...event, tags: event.tags.filter((t) => t[0] !== "outcome") };

    expect(() => parseMarketPayoutEvent(tampered)).toThrow(/missing required tags/);
  });

  it("rejects malformed JSON content", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketPayoutEvent(
      { marketEventId: "m", winningOutcome: 0, recipients: [{ pubkey: "alice", amount: 100 }] },
      secretKey,
    );
    const tampered = { ...event, content: "{not json" };

    expect(() => parseMarketPayoutEvent(tampered)).toThrow(/malformed JSON content/);
  });

  it("rejects content that isn't an array of well-formed recipients", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketPayoutEvent(
      { marketEventId: "m", winningOutcome: 0, recipients: [{ pubkey: "alice", amount: 100 }] },
      secretKey,
    );

    const notArray = { ...event, content: JSON.stringify({ pubkey: "alice", amount: 100 }) };
    expect(() => parseMarketPayoutEvent(notArray)).toThrow(/must be an array/);

    const malformedEntry = { ...event, content: JSON.stringify([{ pubkey: "alice" }]) };
    expect(() => parseMarketPayoutEvent(malformedEntry)).toThrow(/malformed recipient/);
  });

  it("rejects an event of the wrong kind", () => {
    const secretKey = generateSecretKey();
    const event = buildMarketPayoutEvent(
      { marketEventId: "m", winningOutcome: 0, recipients: [{ pubkey: "alice", amount: 100 }] },
      secretKey,
    );
    const wrongKind = { ...event, kind: 1 };

    expect(() => parseMarketPayoutEvent(wrongKind)).toThrow(/Expected kind 7002/);
  });
});

describe("computePayoutShares", () => {
  it("splits the net pool (after the 2.5% admin fee) proportionally among winners", () => {
    const bets = [
      { pubkey: "alice", outcomeIndex: 0, amount: 3000 },
      { pubkey: "bob", outcomeIndex: 0, amount: 1000 },
      { pubkey: "carol", outcomeIndex: 1, amount: 2000 },
    ];

    const recipients = computePayoutShares(bets, 0, 10_000);

    // netPool = 10000 - floor(10000 * 250/10000) = 9750; alice:bob stake 3:1.
    expect(recipients).toEqual([
      { pubkey: "alice", amount: 7312 },
      { pubkey: "bob", amount: 2437 },
    ]);
  });

  it("excludes bettors on a losing outcome entirely, not as zero-amount entries", () => {
    const bets = [{ pubkey: "alice", outcomeIndex: 0, amount: 1000 }, { pubkey: "carol", outcomeIndex: 1, amount: 2000 }];

    const recipients = computePayoutShares(bets, 0, 1000);

    expect(recipients.find((r) => r.pubkey === "carol")).toBeUndefined();
    expect(recipients).toHaveLength(1);
  });

  it("aggregates multiple bets from the same pubkey on the winning outcome", () => {
    const bets = [
      { pubkey: "alice", outcomeIndex: 0, amount: 1000 },
      { pubkey: "alice", outcomeIndex: 0, amount: 1000 },
    ];

    const recipients = computePayoutShares(bets, 0, 1000);

    expect(recipients).toEqual([{ pubkey: "alice", amount: 975 }]);
  });

  it("returns an empty array when nobody staked on the winning outcome", () => {
    const bets = [{ pubkey: "dave", outcomeIndex: 1, amount: 500 }];

    expect(computePayoutShares(bets, 0, 500)).toEqual([]);
  });

  it("never pays out more than the net pool, even with rounding", () => {
    const bets = [
      { pubkey: "alice", outcomeIndex: 0, amount: 1 },
      { pubkey: "bob", outcomeIndex: 0, amount: 1 },
      { pubkey: "carol", outcomeIndex: 0, amount: 1 },
    ];

    const recipients = computePayoutShares(bets, 0, 100);
    const totalPaid = recipients.reduce((sum, r) => sum + r.amount, 0);
    const netPool = 100 - Math.floor((100 * 250) / 10_000);

    expect(totalPaid).toBeLessThanOrEqual(netPool);
  });

  it("supports a custom admin fee in basis points", () => {
    const bets = [{ pubkey: "alice", outcomeIndex: 0, amount: 1000 }];

    const recipients = computePayoutShares(bets, 0, 1000, 0n);

    expect(recipients).toEqual([{ pubkey: "alice", amount: 1000 }]);
  });
});
