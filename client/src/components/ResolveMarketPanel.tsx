import { useState } from "react";
import { resolveMarketOnChain } from "../utils/minaContracts.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import type { MarketListing } from "../hooks/useMarketEvents.js";

interface Props {
  markets: MarketListing[];
  minaWallet: MinaWallet | undefined;
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
export function ResolveMarketPanel({ markets, minaWallet }: Props) {
  const resolvable = markets.filter((m) => m.params.settlementAddress);
  const [marketId, setMarketId] = useState("");
  const [winningOutcome, setWinningOutcome] = useState(0);
  const [totalPool, setTotalPool] = useState("1000");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = resolvable.find((m) => m.params.marketId === marketId);
  const totalPoolAmount = Number(totalPool);
  const canSubmit =
    Boolean(minaWallet) && Boolean(selected) && Number.isFinite(totalPoolAmount) && totalPoolAmount > 0 && !submitting;

  async function resolve() {
    if (!minaWallet || !selected?.params.settlementAddress) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const hash = await resolveMarketOnChain(
        selected.params.settlementAddress,
        minaWallet.privateKey,
        winningOutcome,
        totalPoolAmount,
      );
      setResult(`Resolution sent: ${hash.slice(0, 12)}…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve this market.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">Resolve a market</h3>

      {resolvable.length === 0 ? (
        <p className="text-xs text-vil-muted">
          No markets with an on-chain settlement contract seen yet. Create one with "Deploy real on-chain contracts"
          checked.
        </p>
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
            <option value="">Select a market…</option>
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
                    Winner: {outcome}
                  </option>
                ))}
              </select>
              <input
                value={totalPool}
                onChange={(e) => setTotalPool(e.target.value)}
                placeholder="Total pool (VILCOIN)"
                className={inputClass}
              />
            </>
          )}

          {!minaWallet && <p className="text-[11px] text-vil-faint">Needs a Mina wallet to sign the resolution.</p>}
          {result && <p className="text-xs text-vil-yes">{result}</p>}
          {error && <p className="text-xs text-vil-no">{error}</p>}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void resolve()}
            className="rounded-xl bg-vil-ember py-2.5 text-sm font-bold text-vil-bg disabled:opacity-50"
          >
            {submitting ? "Resolving…" : "Resolve market"}
          </button>
        </>
      )}
    </section>
  );
}
