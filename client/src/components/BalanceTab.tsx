import { useEffect, useState } from "react";
import { fetchAccount } from "o1js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import { useBalance } from "../hooks/useBalance.js";
import { ensureDevnetConnection } from "../utils/minaNetwork.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import { useI18n } from "../context/I18nContext.js";

interface Props {
  identity: VillmondKeypair | undefined;
  relayClient: MarketRelayClient | null;
  minaWallet: MinaWallet | undefined;
  tokenName: string;
  startingBalance: number;
}

/**
 * VILCOIN here is a best-effort estimate, not a ledger — see
 * `useBalance.ts`'s doc comment. Resolving oracles can now publish a kind:7002
 * payout record (see `payout.ts`, wired up in `ResolveMarketPanel`), so wins
 * are reflected here when one exists — but it's still a signed claim, not
 * something enforced on-chain, so a payout only shows up if the oracle who
 * resolved that specific market actually published one. The Mina (Devnet)
 * balance below it, by contrast, is a real on-chain number, fetched live.
 */
export function BalanceTab({ identity, relayClient, minaWallet, tokenName, startingBalance }: Props) {
  const { t, tn, locale } = useI18n();
  const balance = useBalance(relayClient, identity?.publicKeyHex, startingBalance);
  const [minaBalance, setMinaBalance] = useState<string | undefined>(undefined);
  const [minaError, setMinaError] = useState<string | undefined>(undefined);
  const [checkingMina, setCheckingMina] = useState(false);

  useEffect(() => {
    if (!minaWallet) return;
    let cancelled = false;

    setCheckingMina(true);
    setMinaError(undefined);
    ensureDevnetConnection();
    fetchAccount({ publicKey: minaWallet.publicKey })
      .then(({ account }) => {
        if (cancelled) return;
        setMinaBalance(account ? `${account.balance.toString()} nanomina` : t("minaWallet.notFunded"));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMinaError(err instanceof Error ? err.message : t("minaWallet.balanceErrorGeneric"));
      })
      .finally(() => {
        if (!cancelled) setCheckingMina(false);
      });

    return () => {
      cancelled = true;
    };
  }, [minaWallet, t]);

  if (!identity) {
    return <p className="mx-4 mt-4 text-sm text-vil-muted">{t("common.loading")}</p>;
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-3.5 pb-4 text-sm">
      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("balance.estimatedTitle", { tokenName })}
        </h3>

        <p className="font-display text-3xl font-bold text-slate-100">
          {balance.estimatedBalance.toLocaleString(locale)}
        </p>

        <div className="flex flex-col gap-1.5 rounded-xl bg-[#15131F] p-3 text-xs text-vil-muted">
          <div className="flex justify-between">
            <span>{t("balance.startingBalance")}</span>
            <span className="text-slate-200">{balance.startingBalance.toLocaleString(locale)}</span>
          </div>
          <div className="flex justify-between">
            <span>{tn("balance.stakedInBets", balance.betCount)}</span>
            <span className="text-vil-no">-{balance.totalStaked.toLocaleString(locale)}</span>
          </div>
          {balance.payoutCount > 0 && (
            <div className="flex justify-between">
              <span>{tn("balance.payoutsReceived", balance.payoutCount)}</span>
              <span className="text-vil-yes">+{balance.totalPayouts.toLocaleString(locale)}</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-vil-faint">{t("balance.caveat")}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("minaWallet.titleDevnet")}
        </h3>
        {!minaWallet ? (
          <p className="text-xs text-vil-muted">{t("minaWallet.generating")}</p>
        ) : (
          <>
            <p className="text-sm text-slate-200">
              {checkingMina ? t("minaWallet.checking") : (minaBalance ?? "—")}
            </p>
            {minaError && <p className="text-xs text-vil-no">{minaError}</p>}
            <p className="text-[11px] text-vil-faint">{t("balance.notVilcoinNote")}</p>
          </>
        )}
      </section>
    </div>
  );
}
