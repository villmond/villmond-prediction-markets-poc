import { useState } from "react";
import { fetchAccount } from "o1js";
import { ensureDevnetConnection } from "../utils/minaNetwork.js";
import type { FaucetStatus, MinaWallet } from "../hooks/useMinaWallet.js";
import { useI18n } from "../context/I18nContext.js";
import { CopyButton } from "./CopyButton.js";

interface Props {
  wallet: MinaWallet | undefined;
  loading: boolean;
  faucetStatus: FaucetStatus;
  faucetError: string | undefined;
  onRequestFaucet: () => void;
  /** Replaces the local wallet with one derived from a pasted base58 private key — the Mina counterpart to Nostr's nsec import, for a stable admin/oracle/cashier identity (ADMINISTRATION.md §4). */
  onImportKey: (privateKeyBase58: string) => Promise<void>;
}

/** Expert-mode Mina wallet card: address, balance check, Devnet faucet funding, key import — no server involved. */
export function MinaWalletPanel({ wallet, loading, faucetStatus, faucetError, onRequestFaucet, onImportKey }: Props) {
  const { t } = useI18n();
  const [balance, setBalance] = useState<string | undefined>(undefined);
  const [balanceError, setBalanceError] = useState<string | undefined>(undefined);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const [importing, setImporting] = useState(false);

  async function doImport() {
    setImporting(true);
    setImportError(undefined);
    try {
      await onImportKey(importValue);
      setImportValue("");
      setShowImport(false);
      setBalance(undefined);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("minaWallet.importErrorGeneric"));
    } finally {
      setImporting(false);
    }
  }

  async function refreshBalance() {
    if (!wallet) return;
    setCheckingBalance(true);
    setBalanceError(undefined);
    try {
      ensureDevnetConnection();
      const { account } = await fetchAccount({ publicKey: wallet.publicKey });
      setBalance(account ? `${account.balance.toString()} nanomina` : t("minaWallet.notFunded"));
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : t("minaWallet.balanceErrorGeneric"));
    } finally {
      setCheckingBalance(false);
    }
  }

  if (loading || !wallet) {
    return (
      <section className="rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("minaWallet.title")}
        </h3>
        <p className="mt-2 text-xs text-vil-muted">{t("minaWallet.generating")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
        {t("minaWallet.titleDevnet")}
      </h3>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] text-vil-faint">{t("minaWallet.address")}</p>
          <CopyButton value={wallet.address} />
        </div>
        <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">{wallet.address}</code>
      </div>

      <p className="text-xs text-vil-muted">{t("minaWallet.separateKeyNote")}</p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={checkingBalance}
          onClick={() => void refreshBalance()}
          className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-muted disabled:opacity-50"
        >
          {checkingBalance ? t("minaWallet.checking") : t("minaWallet.checkBalance")}
        </button>
        <button
          type="button"
          disabled={faucetStatus === "requesting"}
          onClick={onRequestFaucet}
          className="flex-1 rounded-lg bg-vil-ember py-2 text-xs font-bold text-vil-bg disabled:opacity-50"
        >
          {faucetStatus === "requesting" ? t("minaWallet.requesting") : t("minaWallet.fundFaucet")}
        </button>
      </div>

      {balance !== undefined && (
        <p className="text-xs text-vil-yes">{t("minaWallet.balanceLabel", { balance })}</p>
      )}
      {balanceError && <p className="text-xs text-vil-no">{balanceError}</p>}
      {faucetStatus === "funded" && <p className="text-xs text-vil-yes">{t("minaWallet.faucetSent")}</p>}
      {faucetStatus === "error" && faucetError && <p className="text-xs text-vil-no">{faucetError}</p>}

      <div className="border-t border-vil-line pt-3">
        {showImport ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-vil-faint">{t("minaWallet.importWarning")}</p>
            <input
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder={t("minaWallet.importPlaceholder")}
              className="rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint"
            />
            {importError && <p className="text-xs text-vil-no">{importError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={importing || !importValue.trim()}
                onClick={() => void doImport()}
                className="flex-1 rounded-lg bg-vil-ember py-2 text-xs font-bold text-vil-bg disabled:opacity-50"
              >
                {importing ? t("minaWallet.importing") : t("minaWallet.importConfirm")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportValue("");
                  setImportError(undefined);
                }}
                className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-muted"
              >
                {t("minaWallet.importCancel")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowImport(true)} className="text-[11px] font-bold text-vil-ember">
            {t("minaWallet.importKey")}
          </button>
        )}
      </div>
    </section>
  );
}
