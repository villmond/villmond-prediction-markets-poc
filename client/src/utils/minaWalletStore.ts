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

export async function loadStoredMinaKey(): Promise<string | undefined> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(WALLET_KEY);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to load Mina wallet"));
  });
}

export async function saveMinaKey(privateKeyBase58: string): Promise<void> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(privateKeyBase58, WALLET_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "Failed to save Mina wallet"));
  });
}
