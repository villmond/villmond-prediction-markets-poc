import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

function writeTempConfig(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "villmond-config-"));
  const path = join(dir, "config.yaml");
  writeFileSync(path, yaml, "utf8");
  return path;
}

const VALID_YAML = `
app:
  name: "Villmond Markets"
  logo_url: "/assets/logo.svg"
  theme: "dark"
economy:
  token_name: "VILCOIN"
  initial_user_balance: 1000
  admin_fee_percentage: 2.5
  admin_public_key: "npub1..."
  enable_cashier_network: false
cashier_module:
  escrow_timeout_blocks: 150
  supported_currencies: ["USD", "EUR", "ZEC", "CASH_P2P"]
  min_cashier_stake: 5000
  enable_physical_p2p: true
network:
  default_relays:
    - "wss://relay.damus.io"
    - "wss://nos.lol"
oracles:
  min_reputation_threshold: 3.0
  require_stake: false
markets:
  categories: ["sports", "technology", "politics"]
`;

describe("loadConfig", () => {
  it("parses a valid config.yaml into typed sections", () => {
    const config = loadConfig(writeTempConfig(VALID_YAML));

    expect(config.app.name).toBe("Villmond Markets");
    expect(config.economy.token_name).toBe("VILCOIN");
    expect(config.economy.initial_user_balance).toBe(1000);
    expect(config.economy.enable_cashier_network).toBe(false);
    expect(config.network.default_relays).toEqual(["wss://relay.damus.io", "wss://nos.lol"]);
  });

  it("throws when a required top-level section is missing", () => {
    const yaml = VALID_YAML.replace(/oracles:[\s\S]*/, "");
    expect(() => loadConfig(writeTempConfig(yaml))).toThrow(/oracles/);
  });

  it("throws when network.default_relays is empty", () => {
    const yaml = VALID_YAML.replace(
      /network:\n {2}default_relays:\n {4}- "wss:\/\/relay.damus.io"\n {4}- "wss:\/\/nos.lol"/,
      "network:\n  default_relays: []",
    );
    expect(() => loadConfig(writeTempConfig(yaml))).toThrow(/default_relays/);
  });

  it("throws when markets.categories is empty", () => {
    const yaml = VALID_YAML.replace(
      'categories: ["sports", "technology", "politics"]',
      "categories: []",
    );
    expect(() => loadConfig(writeTempConfig(yaml))).toThrow(/categories/);
  });
});
