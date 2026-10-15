import { useState } from "react";
import { PublicKey } from "o1js";
import {
  lockEscrowOnChain,
  releaseEscrowOnChain,
  timeoutSlashEscrowOnChain,
  arbiterResolveEscrowOnChain,
} from "../utils/minaContracts.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import { useI18n } from "../context/I18nContext.js";
import { useToast } from "../context/ToastContext.js";
import { useActionHistory } from "../hooks/useActionHistory.js";
import { CopyButton } from "./CopyButton.js";

interface Props {
  minaWallet: MinaWallet | undefined;
}

const inputClass =
  "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint";

function parseMinaAddress(input: string): PublicKey | undefined {
  try {
    return PublicKey.fromBase58(input.trim());
  } catch {
    return undefined;
  }
}

/**
 * Expert-mode `CashierEscrow` actions, signed by the local Mina wallet with
 * no server involved. There is no address directory for the P2P Cashier
 * network (PRD 6/6.1 keeps it open — any key can act as cashier/arbiter per
 * trade), so every counterpart is a manual Mina address entry here, the same
 * "no directory, cryptographic authorization only" shape as
 * OracleReputationPanel's one-key-at-a-time lookup.
 */
export function CashierEscrowPanel({ minaWallet }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const { record } = useActionHistory();
  const [cashierAddr, setCashierAddr] = useState("");
  const [userAddr, setUserAddr] = useState("");
  const [arbiterAddr, setArbiterAddr] = useState("");
  const [amount, setAmount] = useState("1000");
  const [deadlineSlot, setDeadlineSlot] = useState("10000");
  const [escrowAddr, setEscrowAddr] = useState("");
  const [favorUser, setFavorUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cashierPk = parseMinaAddress(cashierAddr);
  const userPk = parseMinaAddress(userAddr);
  const arbiterPk = parseMinaAddress(arbiterAddr);
  const amountValue = Number(amount);
  const deadlineValue = Number(deadlineSlot);
  const canLock =
    Boolean(minaWallet) &&
    Boolean(cashierPk) &&
    Boolean(userPk) &&
    Boolean(arbiterPk) &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    Number.isInteger(deadlineValue) &&
    deadlineValue >= 0 &&
    !busy;
  const canActOnEscrow = Boolean(minaWallet) && escrowAddr.trim().length > 0 && !busy;

  async function run(type: string, action: (walletPrivateKey: MinaWallet["privateKey"]) => Promise<string>) {
    if (!minaWallet) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const hash = await action(minaWallet.privateKey);
      const message = t("cashierEscrow.sent", { hash: hash.slice(0, 12) });
      setStatus(message);
      void record({ type, detail: escrowAddr.trim(), hash, address: escrowAddr.trim() });
      toast.push({ message, tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("cashierEscrow.transactionFailed");
      setError(message);
      toast.push({ message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!minaWallet || !cashierPk || !userPk || !arbiterPk) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { escrowAddress, hash } = await lockEscrowOnChain(
        minaWallet.privateKey,
        cashierPk,
        userPk,
        arbiterPk,
        amountValue,
        deadlineValue,
      );
      setEscrowAddr(escrowAddress);
      const message = t("cashierEscrow.locked", { address: escrowAddress.slice(0, 12), hash: hash.slice(0, 12) });
      setStatus(message);
      void record({ type: "escrow.lock", detail: escrowAddress, hash, address: escrowAddress });
      toast.push({ message, tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("cashierEscrow.lockErrorGeneric");
      setError(message);
      toast.push({ message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
        {t("cashierEscrow.title")}
      </h3>

      <div className="flex flex-col gap-2 border-b border-vil-line pb-3.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-vil-muted">
          {t("cashierEscrow.lockNew")}
        </span>
        <input
          value={cashierAddr}
          onChange={(e) => setCashierAddr(e.target.value)}
          placeholder={t("cashierEscrow.cashierAddressPlaceholder")}
          className={inputClass}
        />
        <input
          value={userAddr}
          onChange={(e) => setUserAddr(e.target.value)}
          placeholder={t("cashierEscrow.userAddressPlaceholder")}
          className={inputClass}
        />
        <input
          value={arbiterAddr}
          onChange={(e) => setArbiterAddr(e.target.value)}
          placeholder={t("cashierEscrow.arbiterAddressPlaceholder")}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("cashierEscrow.amountPlaceholder")}
            className={inputClass}
          />
          <input
            value={deadlineSlot}
            onChange={(e) => setDeadlineSlot(e.target.value)}
            placeholder={t("cashierEscrow.deadlineSlotPlaceholder")}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          disabled={!canLock}
          onClick={() => void lock()}
          className="rounded-xl bg-vil-ember py-2.5 text-sm font-bold text-vil-bg disabled:opacity-50"
        >
          {busy ? t("cashierEscrow.working") : t("cashierEscrow.lockEscrow")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wide text-vil-muted">
            {t("cashierEscrow.actOnExisting")}
          </span>
          {escrowAddr.trim() && <CopyButton value={escrowAddr.trim()} />}
        </div>
        <input
          value={escrowAddr}
          onChange={(e) => setEscrowAddr(e.target.value)}
          placeholder={t("cashierEscrow.escrowAddressPlaceholder")}
          className={inputClass}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canActOnEscrow}
            onClick={() => void run("escrow.release", (privateKey) => releaseEscrowOnChain(escrowAddr.trim(), privateKey))}
            className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-yes disabled:opacity-50"
          >
            {t("cashierEscrow.release")}
          </button>
          <button
            type="button"
            disabled={!canActOnEscrow}
            onClick={() => void run("escrow.timeoutSlash", (privateKey) => timeoutSlashEscrowOnChain(escrowAddr.trim(), privateKey))}
            className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-no disabled:opacity-50"
          >
            {t("cashierEscrow.timeoutSlash")}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 text-xs text-vil-muted">
            <input type="checkbox" checked={favorUser} onChange={(e) => setFavorUser(e.target.checked)} />
            {t("cashierEscrow.favorUser")}
          </label>
          <button
            type="button"
            disabled={!canActOnEscrow}
            onClick={() =>
              void run("escrow.arbiterResolve", (privateKey) =>
                arbiterResolveEscrowOnChain(escrowAddr.trim(), privateKey, favorUser),
              )
            }
            className="rounded-lg border border-vil-line px-3 py-2 text-xs font-bold text-vil-muted disabled:opacity-50"
          >
            {t("cashierEscrow.arbiterResolve")}
          </button>
        </div>
      </div>

      {!minaWallet && <p className="text-[11px] text-vil-faint">{t("cashierEscrow.needsWallet")}</p>}
      {status && <p className="text-xs text-vil-yes">{status}</p>}
      {error && <p className="text-xs text-vil-no">{error}</p>}
    </section>
  );
}
