import { useState } from "react";
import { PublicKey } from "o1js";
import { buildMarketCreationEvent, type MarketOutcomeType } from "@villmond/nostr/marketEvents.js";
import { IpfsClient } from "@villmond/nostr/ipfs.js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { Event as NostrEvent } from "nostr-tools";
import { hexToBytes } from "../utils/hex.js";
import { deployMarketContracts } from "../utils/minaContracts.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";

const CLOSES_IN_OPTIONS = [
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 24 * 7 },
  { label: "2 weeks", hours: 24 * 14 },
] as const;

const MAX_OUTCOMES = 6;

interface Props {
  identity: VillmondKeypair | undefined;
  minaWallet: MinaWallet | undefined;
  onPublish: (event: NostrEvent) => void;
  onClose: () => void;
}

/** Decodes a Mina base58 public key; returns undefined if it doesn't parse. */
function resolveMinaPublicKey(input: string): PublicKey | undefined {
  try {
    return PublicKey.fromBase58(input.trim());
  } catch {
    return undefined;
  }
}

/**
 * Newbie-mode "new market" form. Pins the question/outcomes to IPFS (real
 * pin, via `IpfsClient`'s default local Kubo endpoint — see DEPLOYMENT.md
 * §2) before signing and publishing the kind:30000 event; a pin failure is
 * shown as an error rather than silently publishing a market with a
 * placeholder metadata CID.
 *
 * The on-chain deployment checkbox is opt-in: it deploys and configures a
 * real `VilcoinLedger` + `MarketSettlement` pair on Mina Devnet (no server
 * involved — see minaContracts.ts) before publishing, and embeds both
 * addresses in the event so any client can find them later. The market
 * creator's own Mina wallet becomes the deployed `MarketSettlement`'s admin;
 * there is no directory mapping a Nostr admin key to a Mina address, so this
 * is a deliberate POC simplification (same spirit as the oracle/cashier
 * "informational directory, not an access gate" design in roles.ts).
 */
export function CreateMarketModal({ identity, minaWallet, onPublish, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const [outcomeType, setOutcomeType] = useState<MarketOutcomeType>("binary");
  const [outcomes, setOutcomes] = useState<string[]>(["Yes", "No"]);
  const [closesInHours, setClosesInHours] = useState<number>(CLOSES_IN_OPTIONS[1].hours);
  const [deployOnChain, setDeployOnChain] = useState(false);
  const [initialLiquidity, setInitialLiquidity] = useState("1000");
  const [oracleAddress, setOracleAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deployStep, setDeployStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedOutcomes = outcomes.map((o) => o.trim());
  const liquidityAmount = Number(initialLiquidity);
  const oraclePublicKey = resolveMinaPublicKey(oracleAddress);
  const onChainFieldsValid =
    !deployOnChain ||
    (Boolean(minaWallet) && Number.isFinite(liquidityAmount) && liquidityAmount > 0 && Boolean(oraclePublicKey));
  const canSubmit =
    Boolean(identity) &&
    question.trim().length > 0 &&
    trimmedOutcomes.length >= 2 &&
    trimmedOutcomes.every((o) => o.length > 0) &&
    onChainFieldsValid &&
    !submitting;

  function updateOutcome(index: number, value: string) {
    setOutcomes((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOutcome() {
    if (outcomes.length >= MAX_OUTCOMES) return;
    setOutcomes((prev) => [...prev, ""]);
  }

  function removeOutcome(index: number) {
    setOutcomes((prev) => prev.filter((_, i) => i !== index));
  }

  function switchType(next: MarketOutcomeType) {
    setOutcomeType(next);
    setOutcomes(next === "binary" ? ["Yes", "No"] : ["", ""]);
  }

  async function submit() {
    if (!identity || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setDeployStep(null);

    try {
      const ipfs = new IpfsClient();
      const metadataCid = await ipfs.pinJson({ question: question.trim(), outcomes: trimmedOutcomes });

      const marketId = crypto.randomUUID();
      const closesAt = Math.floor(Date.now() / 1000) + closesInHours * 3600;

      let ledgerAddress: string | undefined;
      let settlementAddress: string | undefined;

      if (deployOnChain && minaWallet && oraclePublicKey) {
        setDeployStep("Deploying on-chain contracts to Mina Devnet (first compile can take a minute)…");
        const deployed = await deployMarketContracts(
          minaWallet.privateKey,
          liquidityAmount,
          minaWallet.publicKey,
          oraclePublicKey,
        );
        ledgerAddress = deployed.ledgerAddress;
        settlementAddress = deployed.settlementAddress;
        setDeployStep(null);
      }

      const event = buildMarketCreationEvent(
        {
          marketId,
          question: question.trim(),
          outcomeType,
          outcomes: trimmedOutcomes,
          metadataCid,
          closesAt,
          ledgerAddress,
          settlementAddress,
        },
        hexToBytes(identity.secretKeyHex),
      );

      onPublish(event);
      onClose();
    } catch (err) {
      setDeployStep(null);
      setError(
        err instanceof Error
          ? `Could not publish this market: ${err.message}. Pinning needs a reachable IPFS node (DEPLOYMENT.md §2); on-chain deployment needs a Devnet-funded Mina wallet (DEPLOYMENT.md §1).`
          : "Could not publish this market.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col gap-3.5 overflow-y-auto rounded-t-[24px] border border-vil-line bg-vil-surface p-6 sm:rounded-[24px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-100">New market</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-vil-muted">
            Cancel
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-vil-muted" htmlFor="vl-question">
            Question
          </label>
          <textarea
            id="vl-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will it rain in San Francisco tomorrow?"
            rows={2}
            className={inputClass}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => switchType("binary")}
            className={
              "flex-1 rounded-lg py-2 text-xs font-bold " +
              (outcomeType === "binary" ? "bg-vil-accent text-vil-bg" : "bg-[#100E1A] text-vil-muted")
            }
          >
            Binary (Yes/No)
          </button>
          <button
            type="button"
            onClick={() => switchType("multi")}
            className={
              "flex-1 rounded-lg py-2 text-xs font-bold " +
              (outcomeType === "multi" ? "bg-vil-accent text-vil-bg" : "bg-[#100E1A] text-vil-muted")
            }
          >
            Multiple choice
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-vil-muted">Outcomes</span>
          {outcomes.map((outcome, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={outcome}
                onChange={(e) => updateOutcome(index, e.target.value)}
                placeholder={`Outcome ${index + 1}`}
                className={inputClass + " flex-1"}
              />
              {outcomeType === "multi" && outcomes.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOutcome(index)}
                  className="rounded-lg border border-vil-line px-2.5 text-sm font-bold text-vil-no"
                  aria-label={`Remove outcome ${index + 1}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {outcomeType === "multi" && outcomes.length < MAX_OUTCOMES && (
            <button type="button" onClick={addOutcome} className="text-left text-xs font-bold text-vil-ember">
              + Add outcome
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-vil-muted" htmlFor="vl-closes">
            Closes in
          </label>
          <select
            id="vl-closes"
            value={closesInHours}
            onChange={(e) => setClosesInHours(Number(e.target.value))}
            className={inputClass}
          >
            {CLOSES_IN_OPTIONS.map((opt) => (
              <option key={opt.hours} value={opt.hours}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 border-t border-vil-line pt-3">
          <label className="flex items-center gap-2 text-xs font-bold text-vil-muted">
            <input
              type="checkbox"
              checked={deployOnChain}
              onChange={(e) => setDeployOnChain(e.target.checked)}
              disabled={!minaWallet}
            />
            Deploy real on-chain contracts (Mina Devnet)
          </label>

          {!minaWallet && (
            <p className="text-[11px] text-vil-faint">Needs a Mina wallet — open Expert Mode to generate one.</p>
          )}

          {deployOnChain && minaWallet && (
            <div className="flex flex-col gap-1.5">
              <input
                value={initialLiquidity}
                onChange={(e) => setInitialLiquidity(e.target.value)}
                placeholder="Initial liquidity (VILCOIN)"
                className={inputClass}
              />
              <input
                value={oracleAddress}
                onChange={(e) => setOracleAddress(e.target.value)}
                placeholder="Oracle's Mina address (B62q…)"
                className={inputClass}
              />
              {oracleAddress.trim() && !oraclePublicKey && (
                <p className="text-[11px] text-vil-no">Not a valid Mina public key.</p>
              )}
              <p className="text-[11px] text-vil-faint">
                Your own Mina wallet becomes this market's admin; your wallet pays the deploy/seed/configure fees.
              </p>
            </div>
          )}
        </div>

        {deployStep && <p className="text-xs text-vil-muted">{deployStep}</p>}
        {error && <p className="text-xs text-vil-no">{error}</p>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="mt-1 w-full rounded-xl bg-vil-ember py-3 text-sm font-bold text-vil-bg disabled:opacity-50"
        >
          {submitting ? (deployStep ? "Deploying…" : "Publishing…") : "Publish market"}
        </button>
      </div>
    </div>
  );
}
