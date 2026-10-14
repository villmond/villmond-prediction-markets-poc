import { load } from "js-yaml";
import type { VillmondConfig } from "@villmond/nostr/config.js";

/**
 * Fetches `config.yaml` as a static asset at runtime (served from
 * `client/public/config.yaml`, symlinked to the repo root) rather than
 * bundling it at build time — so a white-label deployer can swap branding,
 * fees, and relays without rebuilding the PWA (PRD 5.1).
 */
let cached: VillmondConfig | undefined;

/** Mirrors the validation nostr/src/config.ts's loadConfig() runs on the Node/test side. */
function validateConfig(parsed: Partial<VillmondConfig> | undefined): VillmondConfig {
  if (!parsed) {
    throw new Error("config.yaml is empty or invalid YAML");
  }

  for (const section of ["app", "economy", "cashier_module", "network", "oracles"] as const) {
    if (!parsed[section]) {
      throw new Error(`config.yaml is missing required section: "${section}"`);
    }
  }

  if (!Array.isArray(parsed.network?.default_relays) || parsed.network.default_relays.length === 0) {
    throw new Error("config.yaml network.default_relays must be a non-empty array");
  }

  return parsed as VillmondConfig;
}

export async function loadClientConfig(): Promise<VillmondConfig> {
  if (cached) return cached;

  const response = await fetch("/config.yaml");
  if (!response.ok) {
    throw new Error(`Failed to fetch config.yaml: HTTP ${response.status}`);
  }

  const raw = await response.text();
  cached = validateConfig(load(raw) as Partial<VillmondConfig> | undefined);
  return cached;
}
