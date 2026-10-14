/**
 * Single shared IndexedDB connection for the whole app. Every object store
 * is declared here and created in one `onupgradeneeded` — two modules each
 * independently calling `indexedDB.open("villmond", <own version>)` would
 * race (whichever runs first "wins" the version, and the other's open call
 * throws a VersionError once the DB has already been upgraded past it).
 */
export const DB_NAME = "villmond";
export const DB_VERSION = 2;

export const STORES = {
  identity: "identity",
  minaWallet: "mina-wallet",
} as const;

export function openVillmondDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to open IndexedDB"));
  });
}
