import { PrivateKey } from "o1js";

const DOMAIN_PREFIX = "villmond-mina-key-v1:";

/**
 * Deterministically derives a Mina `PrivateKey` from the Nostr identity's
 * secret key, so restoring just the `nsec` on a new device also restores
 * this same Mina address — no separate Mina backup needed. SHA-256 over a
 * domain-separated string; `PrivateKey.fromBigInt` reduces the result into
 * the Pallas scalar field internally (`Scalar.from`: "if the input is too
 * large, it is reduced modulo the scalar field size"). The derivation's
 * entropy comes entirely from the Nostr secret key, which is itself
 * securely random, so this isn't the "insecurely sampled key" case
 * `fromBigInt`'s own doc comment warns against.
 */
export async function deriveMinaKeyFromNostrSecret(secretKeyHex: string): Promise<PrivateKey> {
  const bytes = new TextEncoder().encode(DOMAIN_PREFIX + secretKeyHex);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return PrivateKey.fromBigInt(BigInt(`0x${hex}`));
}
