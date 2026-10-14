import { useState } from "react";
import { fetchAccount } from "o1js";
import { ensureDevnetConnection } from "../utils/minaNetwork.js";
import type { FaucetStatus, MinaWallet } from "../hooks/useMinaWallet.js";

interface Props {
  wallet: MinaWallet | undefined;
  loading: boolean;
  faucetStatus: FaucetStatus;
  faucetError: string | undefined;
  onRequestFaucet: () => void;
}

/** Expert-mode Mina wallet card: address, balance check, Devnet faucet funding — no server involved. */
export function MinaWalletPanel({ wallet, loading, faucetStatus, faucetError, onRequestFaucet }: Props) {
  const [balance, setBalance] = useState<string | undefined>(undefined);
  const [balanceError, setBalanceError] = useState<string | undefined>(undefined);
  const [checkingBalance, setCheckingBalance] = useState(false);

  async function refreshBalance() {
    if (!wallet) return;
    setCheckingBalance(true);
    setBalanceError(undefined);
    try {
      ensureDevnetConnection();
      const { account } = await fetchAccount({ publicKey: wallet.publicKey });
      setBalance(account ? `${account.balance.toString()} nanomina` : "Account not yet funded on Devnet");
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Could not fetch balance.");
    } finally {
      setCheckingBalance(false);
    }
  }

  if (loading || !wallet) {
    return (
      <section className="rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">Mina wallet</h3>
        <p className="mt-2 text-xs text-vil-muted">Generating wallet…</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
        Mina wallet (Devnet)
      </h3>

      <div>
        <p className="mb-1 text-[11px] text-vil-faint">Address</p>
        <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">{wallet.address}</code>
      </div>

      <p className="text-xs text-vil-muted">
        A separate key from your Nostr identity — this one signs every on-chain zkApp call this app
        makes, with no server in between (see DEPLOYMENT.md §1).
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={checkingBalance}
          onClick={() => void refreshBalance()}
          className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-muted disabled:opacity-50"
        >
          {checkingBalance ? "Checking…" : "Check balance"}
        </button>
        <button
          type="button"
          disabled={faucetStatus === "requesting"}
          onClick={onRequestFaucet}
          className="flex-1 rounded-lg bg-vil-ember py-2 text-xs font-bold text-vil-bg disabled:opacity-50"
        >
          {faucetStatus === "requesting" ? "Requesting… (~30–60s)" : "Fund via Devnet faucet"}
        </button>
      </div>

      {balance !== undefined && <p className="text-xs text-vil-yes">Balance: {balance}</p>}
      {balanceError && <p className="text-xs text-vil-no">{balanceError}</p>}
      {faucetStatus === "funded" && (
        <p className="text-xs text-vil-yes">Faucet request sent — funds should arrive shortly.</p>
      )}
      {faucetStatus === "error" && faucetError && <p className="text-xs text-vil-no">{faucetError}</p>}
    </section>
  );
}
