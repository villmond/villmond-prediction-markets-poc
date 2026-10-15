import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

export interface AppConfig {
  name: string;
  logo_url: string;
  theme: "dark" | "light";
}

export interface EconomyConfig {
  token_name: string;
  initial_user_balance: number;
  admin_fee_percentage: number;
  admin_public_key: string;
  enable_cashier_network: boolean;
}

export interface CashierModuleConfig {
  escrow_timeout_blocks: number;
  supported_currencies: string[];
  min_cashier_stake: number;
  enable_physical_p2p: boolean;
  /**
   * Informational directory of recognized Cashier public keys (npub or hex),
   * for client-side role badging only — PRD's P2P Cashier design lets ANY
   * key act as a cashier per-trade (enforced cryptographically by
   * `CashierEscrow`'s own signature checks), so this list never gates
   * access, only UI discovery/recognition.
   */
  designated_public_keys?: string[];
}

export interface NetworkConfig {
  default_relays: string[];
}

export interface MarketsConfig {
  /** Browse categories offered at market creation and used to filter the markets list. Not a closed enum — any string works; unlisted categories already in use still parse and filter fine (see `UNCATEGORIZED_CATEGORY`). */
  categories: string[];
}

export interface OraclesConfig {
  min_reputation_threshold: number;
  require_stake: boolean;
  /**
   * Informational directory of designated Oracle public keys (npub or hex),
   * per PRD 5.4 ("Specific public keys are designated as Oracles via
   * configuration"). UI-only role badging — real resolution authority is
   * still the per-market `oraclePublicKey` configured on each
   * `MarketSettlement` instance, not this list.
   */
  designated_public_keys?: string[];
}

export interface VillmondConfig {
  app: AppConfig;
  economy: EconomyConfig;
  cashier_module: CashierModuleConfig;
  network: NetworkConfig;
  oracles: OraclesConfig;
  markets: MarketsConfig;
}

/**
 * Loads and validates the root `config.yaml` white-label configuration.
 * Defaults to the repository root `config.yaml` when no path is supplied.
 */
export function loadConfig(path = resolve(process.cwd(), "config.yaml")): VillmondConfig {
  const raw = readFileSync(path, "utf8");
  const parsed = load(raw) as Partial<VillmondConfig> | undefined;

  if (!parsed) {
    throw new Error(`config.yaml at ${path} is empty or invalid YAML`);
  }

  for (const section of ["app", "economy", "cashier_module", "network", "oracles", "markets"] as const) {
    if (!parsed[section]) {
      throw new Error(`config.yaml is missing required section: "${section}"`);
    }
  }

  if (!Array.isArray(parsed.network?.default_relays) || parsed.network.default_relays.length === 0) {
    throw new Error("config.yaml network.default_relays must be a non-empty array");
  }

  if (!Array.isArray(parsed.markets?.categories) || parsed.markets.categories.length === 0) {
    throw new Error("config.yaml markets.categories must be a non-empty array");
  }

  return parsed as VillmondConfig;
}
