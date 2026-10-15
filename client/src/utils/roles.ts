import type { UxView } from "../context/ModeContext.js";

export type UserRole = "admin" | "oracle" | "cashier";

/**
 * Informational-only role badging (lower-risk path): compares the local
 * identity's keys against `config.yaml`'s admin key and the oracle/cashier
 * directories. Never gates any action — real authorization stays
 * cryptographic and per-contract (a market's configured `oraclePublicKey`,
 * a trade's `cashierPublicKey`, etc.). This only tells the UI "you might
 * recognize this key", nothing more.
 */
export function detectRoles(
  identity: { npub: string; publicKeyHex: string } | undefined,
  config: { adminPublicKey: string; oraclePublicKeys: string[]; cashierPublicKeys: string[] },
): UserRole[] {
  if (!identity) return [];

  const mine = new Set([identity.npub.toLowerCase(), identity.publicKeyHex.toLowerCase()]);
  const matches = (value: string) => mine.has(value.trim().toLowerCase());

  const roles: UserRole[] = [];
  if (matches(config.adminPublicKey)) roles.push("admin");
  if (config.oraclePublicKeys.some(matches)) roles.push("oracle");
  if (config.cashierPublicKeys.some(matches)) roles.push("cashier");
  return roles;
}

/**
 * Single source of truth for which tabs a role set may see, used by both
 * `BottomNav` (filtering) and `App.tsx` (redirecting away from a tab that's
 * no longer allowed). Cosmetic UX only — real authorization always stays
 * cryptographic and per-contract (ADMINISTRATION.md §0); this never gates
 * an actual on-chain action, only whether its UI is shown.
 */
export function isViewAllowed(view: UxView, roles: UserRole[], cashierEnabled: boolean): boolean {
  if (view === "oracle") return roles.includes("oracle");
  if (view === "cashier") return cashierEnabled && roles.includes("cashier");
  if (view === "expert") return roles.includes("admin");
  return true;
}
