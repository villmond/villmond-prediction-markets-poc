import { useCallback, useEffect, useState } from "react";
import { generateKeypair, importFromNsec, type VillmondKeypair } from "@villmond/nostr/keypair.js";
import { loadStoredIdentity, saveIdentity } from "../utils/identityStore.js";

export interface UseIdentityResult {
  identity: VillmondKeypair | undefined;
  /** True only on the very first visit, before any identity existed in IndexedDB. */
  isFreshIdentity: boolean;
  loading: boolean;
  importIdentity: (nsec: string) => Promise<void>;
}

/** Zero-app onboarding: loads the persisted identity, or silently generates one (PRD 5.2). */
export function useIdentity(): UseIdentityResult {
  const [identity, setIdentity] = useState<VillmondKeypair | undefined>(undefined);
  const [isFreshIdentity, setIsFreshIdentity] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadStoredIdentity();
      if (cancelled) return;

      if (stored) {
        setIdentity(stored);
      } else {
        const fresh = generateKeypair();
        await saveIdentity(fresh);
        if (cancelled) return;
        setIdentity(fresh);
        setIsFreshIdentity(true);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const importIdentity = useCallback(async (nsec: string) => {
    const imported = importFromNsec(nsec);
    await saveIdentity(imported);
    setIdentity(imported);
    setIsFreshIdentity(false);
  }, []);

  return { identity, isFreshIdentity, loading, importIdentity };
}
