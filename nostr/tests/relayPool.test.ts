import { describe, expect, it } from "vitest";
import { MarketRelayClient } from "../src/relayPool.js";

describe("MarketRelayClient", () => {
  it("constructs and tears down cleanly without any live connections", () => {
    const client = new MarketRelayClient(["wss://relay.example.invalid"]);
    expect(() => client.close()).not.toThrow();
  });
});
