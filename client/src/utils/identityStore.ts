import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import { openVillmondDb, STORES } from "./db.js";

/**
 * Zero-app onboarding key storage (PRD 5.2: "saves it securely to browser
 * storage (IndexedDB)"). Deliberately storing the structured keypair object
 * directly via IndexedDB's structured-clone support, rather than hand
 * rolling serialization.
 */
const STORE_NAME = STORES.identity;
const IDENTITY_KEY = "default";

export async function loadStoredIdentity(): Promise<VillmondKeypair | undefined> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(IDENTITY_KEY);
    request.onsuccess = () => resolve(request.result as VillmondKeypair | undefined);
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to load identity"));
  });
}

export async function saveIdentity(identity: VillmondKeypair): Promise<void> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(identity, IDENTITY_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "Failed to save identity"));
  });
}
