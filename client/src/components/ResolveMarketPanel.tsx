import { useState } from "react";
import { fetchAccount, PublicKey } from "o1js";
import type { Event as NostrEvent } from "nostr-tools";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import { buildMarketPayoutEvent, computePayoutShares } from "@villmond/nostr/payout.js";
import { resolveMarketOnChain } from "../utils/minaContracts.js";
import { ensureDevnetConnection } from "../utils/minaNetwork.js";
import { hexToBytes } from "../utils/hex.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import type { MarketListing } from "../hooks/useMarketEvents.js";
import { useI18n } from "../context/I18nContext.js";
import { useToast } from "../context/ToastContext.js";
import { useActionHistory } from "../hooks/useActionHistory.js";

interface Props {
  markets: MarketListing[];
  minaWallet: MinaWallet | undefined;
  identity: VillmondKeypair | undefined;
  relayClient: MarketRelayClient | null;
  onPublish: (event: NostrEvent) => void;
}

const inputClass =
  "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint";

/**
 * Expert-mode oracle action: resolves a deployed `MarketSettlement` directly
 * from the browser, signed by the local Mina wallet — no server involved.
 * Real authorization is cryptographic (the contract only accepts a signature
 * from the `oraclePublicKey` it was configured with at deploy time); this
 * panel doesn't gate who can attempt it, same as CreateMarketModal's
 * "informational directory, not an access gate" role badges.
 */
export function ResolveMarketPanel({ markets, minaWallet, identity, relayClient, onPublish }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const { record } = useActionHistory();
  const resolvable = markets.filter((m) => m.params.settlementAddress);
  const [marketId, setMarketId] = useState("");
  const [winningOutcome, setWinningOutcome] = useState(0);
  const [totalPool, setTotalPool] = useState("1000");
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPool, setFetchingPool] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);

  const selected = resolvable.find((m) => m.params.marketId === marketId);
  const totalPoolAmount = Number(totalPool);
  const canSubmit =
    Boolean(minaWallet) && Boolean(selected) && Number.isFinite(totalPoolAmount) && totalPoolAmount > 0 && !submitting;

  async function fetchPoolFromChain() {
    if (!selected?.params.ledgerAddress) return;
    setFetchingPool(true);
    setError(null);
    try {
      ensureDevnetConnection();
      const { account } = await fetchAccount({ publicKey: PublicKey.fromBase58(selected.params.ledgerAddress) });
      const outcomeAPool = account?.zkapp?.appState[0];
      const outcomeBPool = account?.zkapp?.appState[1];
      if (!outcomeAPool || !outcomeBPool) {
        setError(t("resolveMarket.poolFetchErrorNotFound"));
        return;
      }
      const total = outcomeAPool.add(outcomeBPool).toBigInt();
      setTotalPool(total.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("resolveMarket.poolFetchErrorGeneric"));
    } finally {
      setFetchingPool(false);
    }
  }

  /**
   * Computes each winning bettor's proportional share of the resolved pool
   * (minus the admin fee, via `computePayoutShares`) from their own signed
   * kind:7001 stakes, and publishes it as a kind:7002 payout record. This is
   * what makes the Balance tab's payout side real instead of permanently
   * empty — see payout.ts's doc comment for why this is a signed claim, not
   * an on-chain-enforced one (same trust tier as the rest of this app's
   * off-chain VILCOIN accounting).
   */
  async function publishPayout(adminFeeBps = 250n) {
    if (!identity || !relayClient || !selected) return;
    setPayoutStatus(null);
    try {
      const bets = await relayClient.queryBetsForMarket(selected.eventId);
      const recipients = computePayoutShares(bets, winningOutcome, totalPoolAmount, adminFeeBps);
      if (recipients.length === 0) {
        setPayoutStatus(t("resolveMarket.noWinningBetsFound"));
        return;
      }

      const event = buildMarketPayoutEvent(
        { marketEventId: selected.eventId, winningOutcome, recipients },
        hexToBytes(identity.secretKeyHex),
      );
      onPublish(event);
      setPayoutStatus(t("resolveMarket.payoutPublished", { count: recipients.length }));
    } catch (err) {
      setPayoutStatus(err instanceof Error ? err.message : t("resolveMarket.payoutErrorGeneric"));
    }
  }

  async function resolve() {
    if (!minaWallet || !selected?.params.settlementAddress) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setPayoutStatus(null);
    try {
      const hash = await resolveMarketOnChain(
        selected.params.settlementAddress,
        minaWallet.privateKey,
        winningOutcome,
        totalPoolAmount,
      );
      setResult(t("resolveMarket.resultSent", { hash: hash.slice(0, 12) }));
      void record({ type: "market.resolve", detail: selected.params.question, hash });
      toast.push({ message: t("resolveMarket.resultSent", { hash: hash.slice(0, 12) }), tone: "success" });
      await publishPayout();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("resolveMarket.errorGeneric");
      setError(message);
      toast.push({ message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
        {t("resolveMarket.title")}
      </h3>

      {resolvable.length === 0 ? (
        <p className="text-xs text-vil-muted">{t("resolveMarket.noMarkets")}</p>
      ) : (
        <>
          <select
            value={marketId}
            onChange={(e) => {
              setMarketId(e.target.value);
              setWinningOutcome(0);
            }}
            className={inputClass}
          >
            <option value="">{t("resolveMarket.selectMarket")}</option>
            {resolvable.map((m) => (
              <option key={m.params.marketId} value={m.params.marketId}>
                {m.params.question}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <select
                value={winningOutcome}
                onChange={(e) => setWinningOutcome(Number(e.target.value))}
                className={inputClass}
              >
                {selected.params.outcomes.map((outcome, index) => (
                  <option key={outcome} value={index}>
                    {t("resolveMarket.winner", { outcome })}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={totalPool}
                  onChange={(e) => setTotalPool(e.target.value)}
                  placeholder={t("resolveMarket.totalPoolPlaceholder")}
                  className={inputClass + " flex-1"}
                />
                {selected.params.ledgerAddress && (
                  <button
                    type="button"
                    disabled={fetchingPool}
                    onClick={() => void fetchPoolFromChain()}
                    className="rounded-lg border border-vil-line px-3 text-xs font-bold text-vil-muted disabled:opacity-50"
                  >
                    {fetchingPool ? t("resolveMarket.fetchingPool") : t("resolveMarket.fetchPool")}
                  </button>
                )}
              </div>
            </>
          )}

          {!minaWallet && <p className="text-[11px] text-vil-faint">{t("resolveMarket.needsWallet")}</p>}
          {result && <p className="text-xs text-vil-yes">{result}</p>}
          {payoutStatus && <p className="text-xs text-vil-yes">{payoutStatus}</p>}
          {error && <p className="text-xs text-vil-no">{error}</p>}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void resolve()}
            className="rounded-xl bg-vil-ember py-2.5 text-sm font-bold text-vil-bg disabled:opacity-50"
          >
            {submitting ? t("resolveMarket.resolving") : t("resolveMarket.submit")}
          </button>
        </>
      )}
    </section>
  );
}
