import { useState } from "react";
import { nip19 } from "nostr-tools";
import { buildOracleRatingEvent } from "@villmond/nostr/oracleReputation.js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { Event as NostrEvent } from "nostr-tools";
import { useOracleReputation } from "../hooks/useOracleReputation.js";
import { useRelayClient } from "../hooks/useRelayClient.js";
import { hexToBytes } from "../utils/hex.js";

interface Props {
  relays: string[];
  identity: VillmondKeypair | undefined;
  minReputationThreshold: number;
  onPublish: (event: NostrEvent) => void;
}

/** Decodes an npub or accepts a raw hex pubkey; returns undefined if neither parses. */
function resolvePublicKeyHex(input: string): string | undefined {
  const trimmed = input.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    return decoded.type === "npub" ? decoded.data : undefined;
  } catch {
    return undefined;
  }
}

/** Expert-mode oracle lookup + rating form (PRD 5.4). No oracle directory exists yet, so this looks up one key at a time. */
export function OracleReputationPanel({ relays, identity, minReputationThreshold, onPublish }: Props) {
  const [lookup, setLookup] = useState("");
  const [score, setScore] = useState(5);
  const [review, setReview] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const relayClient = useRelayClient(relays);
  const oraclePublicKey = resolvePublicKeyHex(lookup);
  const reputation = useOracleReputation(relayClient, oraclePublicKey);

  function submitRating() {
    if (!identity || !oraclePublicKey) return;
    setSubmitError(null);
    try {
      const event = buildOracleRatingEvent(
        { oraclePublicKey, score, review: review.trim() || undefined },
        hexToBytes(identity.secretKeyHex),
      );
      onPublish(event);
      setReview("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not publish this rating.");
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
        Oracle reputation
      </h3>

      <input
        value={lookup}
        onChange={(e) => setLookup(e.target.value)}
        placeholder="Oracle npub or hex public key"
        className="rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint"
      />

      {lookup.trim() && !oraclePublicKey && (
        <p className="text-xs text-vil-no">Not a valid npub or hex public key.</p>
      )}

      {oraclePublicKey && reputation && (
        <div className="rounded-xl bg-[#15131F] p-3 text-xs">
          <p className="text-slate-200">
            Average score: <span className="font-bold">{reputation.averageScore.toFixed(2)}</span> (
            {reputation.ratingCount} rating{reputation.ratingCount === 1 ? "" : "s"})
          </p>
          <p className={reputation.meetsThreshold(minReputationThreshold) ? "text-vil-yes" : "text-vil-no"}>
            {reputation.meetsThreshold(minReputationThreshold)
              ? `Meets the configured minimum (${minReputationThreshold})`
              : `Below the configured minimum (${minReputationThreshold})`}
          </p>
        </div>
      )}

      {oraclePublicKey && (
        <div className="flex flex-col gap-2 border-t border-vil-line pt-3">
          <label className="text-[11px] font-bold uppercase tracking-wide text-vil-muted" htmlFor="vl-oracle-score">
            Your rating
          </label>
          <select
            id="vl-oracle-score"
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Optional review"
            rows={2}
            className="rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint"
          />
          {submitError && <p className="text-xs text-vil-no">{submitError}</p>}
          <button
            type="button"
            disabled={!identity}
            onClick={submitRating}
            className="rounded-xl bg-vil-ember py-2.5 text-sm font-bold text-vil-bg disabled:opacity-50"
          >
            Submit rating
          </button>
        </div>
      )}
    </section>
  );
}
