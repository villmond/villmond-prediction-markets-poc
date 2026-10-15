import { openVillmondDb, STORES } from "./db.js";

const STORE_NAME = STORES.actionHistory;
const MAX_RECORDS = 100;

export interface ActionRecord {
  id: string;
  /** e.g. "market.deploy", "market.buy", "market.resolve", "escrow.lock", "escrow.release", "escrow.timeoutSlash", "escrow.arbiterResolve". */
  type: string;
  /** Short human-readable context — a market question, an escrow address, etc. */
  detail: string;
  hash?: string;
  address?: string;
  timestamp: number;
}

/**
 * Local-only record of this browser's own on-chain actions. Exists because
 * this app has no backend: close the tab after locking a CashierEscrow and
 * the address shown once in a status toast is otherwise gone except by
 * digging through the raw Nostr event log.
 */
export async function recordAction(record: Omit<ActionRecord, "id" | "timestamp">): Promise<void> {
  const db = await openVillmondDb();
  const full: ActionRecord = { ...record, id: crypto.randomUUID(), timestamp: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(full, full.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "Failed to record action"));
  });
}

/** Most recent actions first, capped at MAX_RECORDS. */
export async function listActions(): Promise<ActionRecord[]> {
  const db = await openVillmondDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const all = (request.result as ActionRecord[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(all.slice(0, MAX_RECORDS));
    };
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to list actions"));
  });
}
