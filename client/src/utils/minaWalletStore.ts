import { openVillmondDb, STORES } from "./db.js";

/**
 * Mina wallet key storage — deliberately a SEPARATE store from the Nostr
 * identity in `identityStore.ts`. Mina uses the Pallas curve (o1js
 * `PrivateKey`/`PublicKey`, base58 `B62.../EKE...`); Nostr uses secp256k1
 * (`nsec`/`npub`). They are not interchangeable keys, so a user has two
 * separate client-side identities: one for signing Nostr events, one for
 * signing Mina transactions.
 */
const STORE_NAME = STORES.minaWallet;
const WALLET_KEY = "default";

export interface StoredMinaWallet {
  privateKeyBase58: string;
  /** Nostr pubkey (hex) this key was derived for/belongs to. Absent on entries saved before this field existed. */
  pubkeyHex?: string;
}

/** Normalizes a legacy bare-string entry (saved before `pubkeyHex` tagging existed) into the current shape. */
export async function loadStoredMinaKey(): Promise<StoredMinaWallet | undefined> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(WALLET_KEY);
    request.onsuccess = () => {
      const result = request.result as string | StoredMinaWallet | undefined;
      if (result === undefined) {
        resolve(undefined);
      } else if (typeof result === "string") {
        resolve({ privateKeyBase58: result });
      } else {
        resolve(result);
      }
    };
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to load Mina wallet"));
  });
}

export async function saveMinaKey(privateKeyBase58: string, pubkeyHex?: string): Promise<void> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ privateKeyBase58, pubkeyHex }, WALLET_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "Failed to save Mina wallet"));
  });
}
