import { useCallback, useEffect, useState } from "react";
import { Mina, PrivateKey, PublicKey } from "o1js";
import { loadStoredMinaKey, saveMinaKey } from "../utils/minaWalletStore.js";

export interface MinaWallet {
  privateKey: PrivateKey;
  publicKey: PublicKey;
  address: string;
}

export type FaucetStatus = "idle" | "requesting" | "funded" | "error";

export interface UseMinaWalletResult {
  wallet: MinaWallet | undefined;
  loading: boolean;
  faucetStatus: FaucetStatus;
  faucetError: string | undefined;
  requestFaucetFunds: () => Promise<void>;
  /** Replaces the local wallet with one derived from a pasted base58 private key (same role Nostr's nsec import already fills). */
  importMinaKey: (privateKeyBase58: string) => Promise<void>;
}

/**
 * Zero-app Mina wallet: silently generates (or loads) a Mina keypair on
 * first visit, persisted to IndexedDB — the same zero-friction pattern as
 * `useIdentity.ts`'s Nostr keypair, but a separate key (see
 * `minaWalletStore.ts` for why). This is what signs every on-chain zkApp
 * call made from this client, with no server in between.
 */
export function useMinaWallet(): UseMinaWalletResult {
  const [wallet, setWallet] = useState<MinaWallet | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus>("idle");
  const [faucetError, setFaucetError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadStoredMinaKey();
      if (cancelled) return;

      let privateKey: PrivateKey;
      if (stored) {
        privateKey = PrivateKey.fromBase58(stored);
      } else {
        privateKey = PrivateKey.random();
        await saveMinaKey(privateKey.toBase58());
        if (cancelled) return;
      }

      const publicKey = privateKey.toPublicKey();
      setWallet({ privateKey, publicKey, address: publicKey.toBase58() });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const requestFaucetFunds = useCallback(async () => {
    if (!wallet) return;
    setFaucetStatus("requesting");
    setFaucetError(undefined);
    try {
      await Mina.faucet(wallet.publicKey);
      setFaucetStatus("funded");
    } catch (err) {
      setFaucetStatus("error");
      setFaucetError(err instanceof Error ? err.message : "Faucet request failed.");
    }
  }, [wallet]);

  const importMinaKey = useCallback(async (privateKeyBase58: string) => {
    const privateKey = PrivateKey.fromBase58(privateKeyBase58.trim());
    await saveMinaKey(privateKey.toBase58());
    const publicKey = privateKey.toPublicKey();
    setWallet({ privateKey, publicKey, address: publicKey.toBase58() });
    setFaucetStatus("idle");
    setFaucetError(undefined);
  }, []);

  return { wallet, loading, faucetStatus, faucetError, requestFaucetFunds, importMinaKey };
}
