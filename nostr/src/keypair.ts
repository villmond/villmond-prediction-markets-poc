import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";

export interface VillmondKeypair {
  /** Raw 32-byte secret key, hex-encoded. Never transmit this over the network. */
  secretKeyHex: string;
  /** Raw 32-byte public key, hex-encoded. */
  publicKeyHex: string;
  /** Bech32-encoded private key (`nsec1...`) for manual export/backup. */
  nsec: string;
  /** Bech32-encoded public key (`npub1...`) for sharing/display. */
  npub: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Zero-app onboarding: silently generates a fresh Nostr identity client-side.
 * The caller is responsible for persisting `secretKeyHex`/`nsec` to
 * browser storage (IndexedDB) — this module performs no storage I/O so it
 * can be reused identically on server-side tooling and tests.
 */
export function generateKeypair(): VillmondKeypair {
  const secretKey = generateSecretKey();
  const publicKeyHex = getPublicKey(secretKey);
  const secretKeyHex = bytesToHex(secretKey);

  return {
    secretKeyHex,
    publicKeyHex,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(publicKeyHex),
  };
}

/** Recovers a keypair from a previously exported `nsec` (power-user key import). */
export function importFromNsec(nsec: string): VillmondKeypair {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") {
    throw new Error(`Expected nsec, got "${decoded.type}"`);
  }

  const secretKey = decoded.data;
  const publicKeyHex = getPublicKey(secretKey);

  return {
    secretKeyHex: bytesToHex(secretKey),
    publicKeyHex,
    nsec,
    npub: nip19.npubEncode(publicKeyHex),
  };
}
