import { useCallback, useEffect, useState } from "react";
import { listActions, recordAction, type ActionRecord } from "../utils/actionHistory.js";

export interface UseActionHistoryResult {
  actions: ActionRecord[];
  record: (entry: Parameters<typeof recordAction>[0]) => Promise<void>;
  refresh: () => void;
}

/** Local history of this browser's own on-chain actions (see actionHistory.ts). */
export function useActionHistory(): UseActionHistoryResult {
  const [actions, setActions] = useState<ActionRecord[]>([]);

  const refresh = useCallback(() => {
    void listActions().then(setActions);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const record = useCallback(
    async (entry: Parameters<typeof recordAction>[0]) => {
      await recordAction(entry);
      refresh();
    },
    [refresh],
  );

  return { actions, record, refresh };
}
