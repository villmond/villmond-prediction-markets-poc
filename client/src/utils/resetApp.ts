import { openVillmondDb, STORES } from "./db.js";

/**
 * Wipes every local store (identity, Mina wallet, action history) plus
 * `localStorage` (locale, nav mode, onboarding-seen flag) — the
 * browser-local equivalent of uninstalling and reinstalling the PWA.
 * Clears each IndexedDB store's contents rather than calling
 * `indexedDB.deleteDatabase`, since that call blocks until every open
 * connection to the database closes, and this app never explicitly closes
 * the connections `openVillmondDb()` opens.
 */
export async function resetAppData(): Promise<void> {
  const db = await openVillmondDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(Object.values(STORES), "readwrite");
    for (const storeName of Object.values(STORES)) {
      tx.objectStore(storeName).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "Failed to clear local data"));
  });
  localStorage.clear();
}
