import { useCallback, useEffect, useState } from "react";
import { Mina, PrivateKey, PublicKey } from "o1js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import { loadStoredMinaKey, saveMinaKey } from "../utils/minaWalletStore.js";
import { deriveMinaKeyFromNostrSecret } from "../utils/minaKeyDerivation.js";

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
 * Zero-app Mina wallet. By default this is deterministically derived from
 * the Nostr identity's secret key (`minaKeyDerivation.ts`), not an
 * independently random key — so restoring just the `nsec` on a new device
 * also restores this same Mina address, with nothing separate to back up.
 * Waits for `identity` to resolve first, since derivation needs its secret
 * key. A stored key tagged for a *different* pubkey than the current
 * identity (or a legacy untagged entry, from before this derivation
 * existed) is left as-is rather than silently replaced — switching
 * identities re-derives fresh only when there's no matching stored key.
 * `importMinaKey` still lets a user override the derived default with a
 * manually pasted key, tagged to whichever identity is active when they do.
 */
export function useMinaWallet(identity: VillmondKeypair | undefined): UseMinaWalletResult {
  const [wallet, setWallet] = useState<MinaWallet | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus>("idle");
  const [faucetError, setFaucetError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;

    void (async () => {
      const stored = await loadStoredMinaKey();
      if (cancelled) return;

      let privateKey: PrivateKey;
      if (stored && (stored.pubkeyHex === undefined || stored.pubkeyHex === identity.publicKeyHex)) {
        privateKey = PrivateKey.fromBase58(stored.privateKeyBase58);
      } else {
        privateKey = await deriveMinaKeyFromNostrSecret(identity.secretKeyHex);
        if (cancelled) return;
        await saveMinaKey(privateKey.toBase58(), identity.publicKeyHex);
        if (cancelled) return;
      }

      const publicKey = privateKey.toPublicKey();
      setWallet({ privateKey, publicKey, address: publicKey.toBase58() });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [identity]);

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

  const importMinaKey = useCallback(
    async (privateKeyBase58: string) => {
      const privateKey = PrivateKey.fromBase58(privateKeyBase58.trim());
      await saveMinaKey(privateKey.toBase58(), identity?.publicKeyHex);
      const publicKey = privateKey.toPublicKey();
      setWallet({ privateKey, publicKey, address: publicKey.toBase58() });
      setFaucetStatus("idle");
      setFaucetError(undefined);
    },
    [identity],
  );

  return { wallet, loading, faucetStatus, faucetError, requestFaucetFunds, importMinaKey };
}
