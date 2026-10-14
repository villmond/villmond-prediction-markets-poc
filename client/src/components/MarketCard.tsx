import { useState } from "react";
import { buildBetPlacementEvent } from "@villmond/nostr/marketEvents.js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { MarketListing } from "../hooks/useMarketEvents.js";
import { hexToBytes } from "../utils/hex.js";
import { buyOutcomeOnChain } from "../utils/minaContracts.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";

const ONE_TAP_AMOUNT = 10;

interface Props {
  listing: MarketListing;
  identity: VillmondKeypair | undefined;
  minaWallet: MinaWallet | undefined;
  onPublish: (event: ReturnType<typeof buildBetPlacementEvent>) => void;
}

/** Formats a unix-seconds deadline as a short relative label, e.g. "closes in 18h". */
function formatCloses(closesAt: number): string {
  const diffMs = closesAt * 1000 - Date.now();
  if (diffMs <= 0) return "closed";
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `closes in ${hours}h`;
  return `closes in ${Math.round(hours / 24)}d`;
}

/**
 * Newbie-mode market card: the question, outcome buttons, and a one-tap bet
 * (PRD 4). When the market was deployed with a `ledgerAddress` (see
 * CreateMarketModal's on-chain checkbox), the tap also sends a real
 * `VilcoinLedger.buyOutcomeA/B` zkApp call signed by the local Mina wallet —
 * no server involved. Markets without a `ledgerAddress` (including ones
 * created by other, Nostr-only clients) keep working exactly as before.
 */
export function MarketCard({ listing, identity, minaWallet, onPublish }: Props) {
  const { params } = listing;
  const [onChainStatus, setOnChainStatus] = useState<string | null>(null);
  const [onChainError, setOnChainError] = useState<string | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<number | null>(null);

  function placeBet(outcomeIndex: number) {
    if (!identity) return;
    const event = buildBetPlacementEvent(
      { marketEventId: listing.eventId, outcomeIndex, amount: ONE_TAP_AMOUNT },
      hexToBytes(identity.secretKeyHex),
    );
    onPublish(event);

    if (params.ledgerAddress && minaWallet) {
      setOnChainError(null);
      setOnChainStatus("Sending on-chain buy to Mina Devnet…");
      setPendingOutcome(outcomeIndex);
      buyOutcomeOnChain(params.ledgerAddress, minaWallet.privateKey, outcomeIndex, ONE_TAP_AMOUNT)
        .then((hash) => setOnChainStatus(`On-chain buy sent: ${hash.slice(0, 12)}…`))
        .catch((err: unknown) => {
          setOnChainStatus(null);
          setOnChainError(err instanceof Error ? err.message : "On-chain buy failed.");
        })
        .finally(() => setPendingOutcome(null));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-vil-line bg-vil-surface p-[18px]">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-vil-accent/15 px-2.5 py-1 text-[11px] font-bold text-[#B9A6FF]">
          {params.outcomeType === "binary" ? "BINARY" : "MULTI"}
        </span>
        <span className="text-[11px] text-vil-faint">{formatCloses(params.closesAt)}</span>
      </div>

      <p className="font-display text-lg font-bold leading-snug text-slate-100">{params.question}</p>

      <div className="flex gap-2.5">
        {params.outcomes.map((outcome, index) => (
          <button
            key={outcome}
            type="button"
            disabled={!identity || pendingOutcome !== null}
            onClick={() => placeBet(index)}
            className={
              "flex-1 rounded-xl border py-3 text-sm font-bold disabled:opacity-50 " +
              (index === 0
                ? "border-vil-yes/35 bg-vil-yes/10 text-vil-yes"
                : "border-vil-no/35 bg-vil-no/10 text-vil-no")
            }
          >
            {outcome}
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] text-vil-faint">
        {params.ledgerAddress
          ? `One tap · stakes ${ONE_TAP_AMOUNT} VILCOIN · also sends a real on-chain buy (Mina Devnet)`
          : `One tap · stakes ${ONE_TAP_AMOUNT} VILCOIN · live odds need on-chain AMM data (upcoming)`}
      </p>
      {onChainStatus && <p className="text-center text-[11px] text-vil-yes">{onChainStatus}</p>}
      {onChainError && <p className="text-center text-[11px] text-vil-no">{onChainError}</p>}
    </div>
  );
}
