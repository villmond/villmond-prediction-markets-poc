import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools";
import {
  CASHIER_ORDER_KIND,
  buildCashierOrderEvent,
  encodeGeohash,
  parseCashierOrderEvent,
} from "../src/cashierOrders.js";

describe("cashier order events", () => {
  it("builds a signed kind:30078 event round-tripping all fields", () => {
    const secretKey = generateSecretKey();
    const params = {
      orderId: "cashier-desk-1",
      side: "sell" as const,
      currency: "USD" as const,
      amountVilcoin: 5000,
      pricePerVilcoin: 0.01,
      geohash: "9q8yy",
    };

    const event = buildCashierOrderEvent(params, secretKey);

    expect(event.kind).toBe(CASHIER_ORDER_KIND);
    expect(parseCashierOrderEvent(event)).toEqual(params);
  });

  it("rejects an event with an invalid side tag", () => {
    const secretKey = generateSecretKey();
    const event = buildCashierOrderEvent(
      { orderId: "x", side: "sell", currency: "ZEC", amountVilcoin: 1, pricePerVilcoin: 1, geohash: "u" },
      secretKey,
    );
    const tampered = { ...event, tags: event.tags.map((t) => (t[0] === "side" ? ["side", "steal"] : t)) };

    expect(() => parseCashierOrderEvent(tampered)).toThrow(/Invalid cashier order side/);
  });

  it("rejects an event missing required tags", () => {
    const secretKey = generateSecretKey();
    const event = buildCashierOrderEvent(
      { orderId: "x", side: "buy", currency: "CASH_P2P", amountVilcoin: 1, pricePerVilcoin: 1, geohash: "u" },
      secretKey,
    );
    const tampered = { ...event, tags: event.tags.filter((t) => t[0] !== "g") };

    expect(() => parseCashierOrderEvent(tampered)).toThrow(/missing required tags/);
  });
});

describe("encodeGeohash", () => {
  it("encodes a known coordinate to its well-known geohash prefix", () => {
    // San Francisco City Hall; 9q8yy... is the standard geohash for this area.
    expect(encodeGeohash(37.7793, -122.4193, 5)).toBe("9q8yy");
  });

  it("produces a longer, more precise hash as precision increases", () => {
    const coarse = encodeGeohash(37.7793, -122.4193, 4);
    const fine = encodeGeohash(37.7793, -122.4193, 8);

    expect(coarse.length).toBe(4);
    expect(fine.length).toBe(8);
    expect(fine.startsWith(coarse)).toBe(true);
  });
});
