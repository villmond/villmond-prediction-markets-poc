import { useEffect, useRef, useState } from "react";
import { PublicKey } from "o1js";
import { buildMarketCreationEvent, type MarketOutcomeType } from "@villmond/nostr/marketEvents.js";
import { DEFAULT_GATEWAYS, IpfsClient } from "@villmond/nostr/ipfs.js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { Event as NostrEvent } from "nostr-tools";
import { hexToBytes } from "../utils/hex.js";
import { deployMarketContracts } from "../utils/minaContracts.js";
import { resizeImageFile } from "../utils/imageResize.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import type { MarketListing } from "../hooks/useMarketEvents.js";
import { useI18n } from "../context/I18nContext.js";
import { useToast } from "../context/ToastContext.js";
import { useActionHistory } from "../hooks/useActionHistory.js";

const CLOSES_IN_OPTIONS = [
  { labelKey: "createMarket.closes6h", hours: 6 },
  { labelKey: "createMarket.closes1d", hours: 24 },
  { labelKey: "createMarket.closes3d", hours: 72 },
  { labelKey: "createMarket.closes1w", hours: 24 * 7 },
  { labelKey: "createMarket.closes2w", hours: 24 * 14 },
] as const;

const MAX_OUTCOMES = 6;

interface Props {
  identity: VillmondKeypair | undefined;
  minaWallet: MinaWallet | undefined;
  categories: string[];
  /**
   * When set, the form edits this market instead of creating a new one:
   * republishes the same `marketId` (NIP-01 replaceable-event semantics
   * make the newest event win), locks outcomeType/outcomes (existing bets
   * reference them by index — relabeling or resizing that array after
   * bets exist would silently corrupt `ResolveMarketPanel`'s payout
   * computation), and carries forward any on-chain `ledgerAddress`/
   * `settlementAddress` unchanged rather than re-deploying.
   */
  editingMarket?: MarketListing;
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

/** Formats a unix-seconds timestamp as a `datetime-local` input value, in local time. */
function toDatetimeLocalValue(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
export function CreateMarketModal({ identity, minaWallet, categories, editingMarket, onPublish, onClose }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const { record } = useActionHistory();
  const isEditing = Boolean(editingMarket);
  const [marketId] = useState(() => editingMarket?.params.marketId ?? crypto.randomUUID());
  const [question, setQuestion] = useState(() => editingMarket?.params.question ?? "");
  const [outcomeType, setOutcomeType] = useState<MarketOutcomeType>(() => editingMarket?.params.outcomeType ?? "binary");
  const [outcomes, setOutcomes] = useState<string[]>(
    () => editingMarket?.params.outcomes ?? [t("createMarket.defaultYes"), t("createMarket.defaultNo")],
  );
  const [outcomesTouched, setOutcomesTouched] = useState(isEditing);
  const [category, setCategory] = useState<string>(() => editingMarket?.params.category ?? categories[0] ?? "");
  const [closesInHours, setClosesInHours] = useState<number>(CLOSES_IN_OPTIONS[1].hours);
  const [useCustomCloseTime, setUseCustomCloseTime] = useState(isEditing);
  const [customCloseAt, setCustomCloseAt] = useState(() =>
    editingMarket ? toDatetimeLocalValue(editingMarket.params.closesAt) : "",
  );
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [resizedImageBlob, setResizedImageBlob] = useState<Blob | null>(null);
  const [existingImageCid, setExistingImageCid] = useState<string | undefined>(() => editingMarket?.params.imageCid);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [deployOnChain, setDeployOnChain] = useState(false);
  const [initialLiquidity, setInitialLiquidity] = useState("1000");
  const [oracleAddress, setOracleAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deployStep, setDeployStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedOutcomes = outcomes.map((o) => o.trim());
  const liquidityAmount = Number(initialLiquidity);
  const oraclePublicKey = resolveMinaPublicKey(oracleAddress);
  const [closesAtValid, setClosesAtValid] = useState(true);
  const onChainFieldsValid =
    !deployOnChain ||
    (Boolean(minaWallet) && Number.isFinite(liquidityAmount) && liquidityAmount > 0 && Boolean(oraclePublicKey));
  const canSubmit =
    Boolean(identity) &&
    question.trim().length > 0 &&
    trimmedOutcomes.length >= 2 &&
    trimmedOutcomes.every((o) => o.length > 0) &&
    category.trim().length > 0 &&
    closesAtValid &&
    onChainFieldsValid &&
    !submitting;

  // Revokes the object URL backing the image preview whenever it's replaced
  // or the modal unmounts — otherwise each picked photo leaks its blob URL.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  // `Date.now()` is impure, so the "is this custom date/time still in the
  // future" check runs here (an effect, outside the render pass) rather
  // than inline in the component body.
  useEffect(() => {
    if (!useCustomCloseTime) {
      setClosesAtValid(true);
      return;
    }
    const ms = new Date(customCloseAt).getTime();
    setClosesAtValid(Number.isFinite(ms) && ms > Date.now());
  }, [useCustomCloseTime, customCloseAt]);

  async function handleImageChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setImageError(null);
    setImageProcessing(true);
    try {
      const resized = await resizeImageFile(file);
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(resized);
      });
      setResizedImageBlob(resized);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : t("createMarket.imageProcessErrorGeneric"));
      setResizedImageBlob(null);
    } finally {
      setImageProcessing(false);
    }
  }

  function clearImage() {
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResizedImageBlob(null);
    setExistingImageCid(undefined);
    setImageError(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  const displayedImageUrl = imagePreviewUrl ?? (existingImageCid ? `${DEFAULT_GATEWAYS[0]}/${existingImageCid}` : null);

  // Re-syncs the binary default outcomes to the current translation whenever
  // `t` changes (dictionary finishes loading, or the user switches locale in
  // Profile) — but only until the user actually edits an outcome, so a
  // slow-to-load dictionary at mount doesn't leave untranslated keys sitting
  // in the form, without ever clobbering real user input.
  useEffect(() => {
    if (outcomesTouched || outcomeType !== "binary") return;
    setOutcomes([t("createMarket.defaultYes"), t("createMarket.defaultNo")]);
  }, [t, outcomesTouched, outcomeType]);

  function updateOutcome(index: number, value: string) {
    setOutcomesTouched(true);
    setOutcomes((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOutcome() {
    if (outcomes.length >= MAX_OUTCOMES) return;
    setOutcomesTouched(true);
    setOutcomes((prev) => [...prev, ""]);
  }

  function removeOutcome(index: number) {
    setOutcomesTouched(true);
    setOutcomes((prev) => prev.filter((_, i) => i !== index));
  }

  function switchType(next: MarketOutcomeType) {
    setOutcomeType(next);
    setOutcomes(next === "binary" ? [t("createMarket.defaultYes"), t("createMarket.defaultNo")] : ["", ""]);
  }

  async function submit() {
    if (!identity || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setDeployStep(null);

    try {
      const ipfs = new IpfsClient();
      const metadataCid = await ipfs.pinJson({ question: question.trim(), outcomes: trimmedOutcomes });

      const closesAt = useCustomCloseTime
        ? Math.floor(new Date(customCloseAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + closesInHours * 3600;

      // Image pin failure is non-fatal: the market still publishes with
      // whatever image it already had (or none), and `MarketImage` already
      // falls back to the category's bundled default whenever there's no
      // CID (or a gateway can't serve one) — so a flaky/unreachable IPFS
      // node never blocks posting.
      let imageCid: string | undefined = existingImageCid;
      if (resizedImageBlob) {
        try {
          imageCid = await ipfs.pinFile(resizedImageBlob, "cover.jpg");
        } catch {
          imageCid = existingImageCid;
          toast.push({ message: t("createMarket.imagePinWarning"), tone: "info" });
        }
      }

      let ledgerAddress: string | undefined = editingMarket?.params.ledgerAddress;
      let settlementAddress: string | undefined = editingMarket?.params.settlementAddress;

      if (deployOnChain && minaWallet && oraclePublicKey) {
        setDeployStep(t("createMarket.deploying"));
        const deployed = await deployMarketContracts(
          minaWallet.privateKey,
          liquidityAmount,
          minaWallet.publicKey,
          oraclePublicKey,
        );
        ledgerAddress = deployed.ledgerAddress;
        settlementAddress = deployed.settlementAddress;
        setDeployStep(null);
        void record({
          type: "market.deploy",
          detail: question.trim(),
          address: ledgerAddress,
        });
        toast.push({ message: t("createMarket.deployedToast"), tone: "success" });
      }

      const event = buildMarketCreationEvent(
        {
          marketId,
          question: question.trim(),
          outcomeType,
          outcomes: trimmedOutcomes,
          metadataCid,
          closesAt,
          category,
          imageCid,
          ledgerAddress,
          settlementAddress,
        },
        hexToBytes(identity.secretKeyHex),
      );

      onPublish(event);
      if (isEditing) {
        toast.push({ message: t("createMarket.editPublished"), tone: "success" });
      }
      onClose();
    } catch (err) {
      setDeployStep(null);
      const message =
        err instanceof Error
          ? t("createMarket.publishErrorWithMessage", { message: err.message })
          : t("createMarket.publishErrorGeneric");
      setError(message);
      toast.push({ message, tone: "error" });
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
          <h2 className="font-display text-lg font-bold text-slate-100">
            {isEditing ? t("createMarket.editTitle") : t("createMarket.title")}
          </h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-vil-muted">
            {t("createMarket.cancel")}
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-vil-muted" htmlFor="vl-question">
            {t("createMarket.question")}
          </label>
          <textarea
            id="vl-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("createMarket.questionPlaceholder")}
            rows={2}
            className={inputClass}
          />
        </div>

        {!isEditing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchType("binary")}
              className={
                "flex-1 rounded-lg py-2 text-xs font-bold " +
                (outcomeType === "binary" ? "bg-vil-accent text-vil-bg" : "bg-[#100E1A] text-vil-muted")
              }
            >
              {t("createMarket.binary")}
            </button>
            <button
              type="button"
              onClick={() => switchType("multi")}
              className={
                "flex-1 rounded-lg py-2 text-xs font-bold " +
                (outcomeType === "multi" ? "bg-vil-accent text-vil-bg" : "bg-[#100E1A] text-vil-muted")
              }
            >
              {t("createMarket.multi")}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-vil-muted">
            {t("createMarket.outcomes")}
          </span>
          {isEditing && <p className="text-[11px] text-vil-faint">{t("createMarket.outcomesLocked")}</p>}
          {outcomes.map((outcome, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={outcome}
                disabled={isEditing}
                onChange={(e) => updateOutcome(index, e.target.value)}
                placeholder={t("createMarket.outcomePlaceholder", { n: index + 1 })}
                className={inputClass + " flex-1 disabled:opacity-50"}
              />
              {!isEditing && outcomeType === "multi" && outcomes.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOutcome(index)}
                  className="rounded-lg border border-vil-line px-2.5 text-sm font-bold text-vil-no"
                  aria-label={t("createMarket.removeOutcome", { n: index + 1 })}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {!isEditing && outcomeType === "multi" && outcomes.length < MAX_OUTCOMES && (
            <button type="button" onClick={addOutcome} className="text-left text-xs font-bold text-vil-ember">
              {t("createMarket.addOutcome")}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-vil-muted" htmlFor="vl-category">
            {t("createMarket.category")}
          </label>
          <select id="vl-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-vil-muted">
            {t("createMarket.image")}
          </span>
          {displayedImageUrl ? (
            <div className="flex flex-col gap-1.5">
              <img src={displayedImageUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
              <button type="button" onClick={clearImage} className="text-left text-xs font-bold text-vil-no">
                {t("createMarket.removeImage")}
              </button>
            </div>
          ) : (
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleImageChange(e.target.files)}
              className={inputClass}
            />
          )}
          <p className="text-[11px] text-vil-faint">{t("createMarket.imageHint")}</p>
          {imageProcessing && <p className="text-xs text-vil-muted">{t("createMarket.imageProcessing")}</p>}
          {imageError && <p className="text-xs text-vil-no">{imageError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-vil-muted" htmlFor="vl-closes">
            {t("createMarket.closesIn")}
          </label>
          <select
            id="vl-closes"
            value={closesInHours}
            onChange={(e) => setClosesInHours(Number(e.target.value))}
            disabled={useCustomCloseTime}
            className={inputClass + " disabled:opacity-50"}
          >
            {CLOSES_IN_OPTIONS.map((opt) => (
              <option key={opt.hours} value={opt.hours}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs font-bold text-vil-muted">
            <input
              type="checkbox"
              checked={useCustomCloseTime}
              onChange={(e) => setUseCustomCloseTime(e.target.checked)}
            />
            {t("createMarket.customCloseTime")}
          </label>
          {useCustomCloseTime && (
            <input
              type="datetime-local"
              value={customCloseAt}
              onChange={(e) => setCustomCloseAt(e.target.value)}
              className={inputClass}
            />
          )}
        </div>

        {!isEditing && (
          <div className="flex flex-col gap-2 border-t border-vil-line pt-3">
            <label className="flex items-center gap-2 text-xs font-bold text-vil-muted">
              <input
                type="checkbox"
                checked={deployOnChain}
                onChange={(e) => setDeployOnChain(e.target.checked)}
                disabled={!minaWallet}
              />
              {t("createMarket.deployOnChain")}
            </label>

            {!minaWallet && <p className="text-[11px] text-vil-faint">{t("createMarket.needsWallet")}</p>}

            {deployOnChain && minaWallet && (
              <div className="flex flex-col gap-1.5">
                <input
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(e.target.value)}
                  placeholder={t("createMarket.liquidityPlaceholder")}
                  className={inputClass}
                />
                <input
                  value={oracleAddress}
                  onChange={(e) => setOracleAddress(e.target.value)}
                  placeholder={t("createMarket.oraclePlaceholder")}
                  className={inputClass}
                />
                {oracleAddress.trim() && !oraclePublicKey && (
                  <p className="text-[11px] text-vil-no">{t("createMarket.invalidOracleKey")}</p>
                )}
                <p className="text-[11px] text-vil-faint">{t("createMarket.adminNote")}</p>
              </div>
            )}
          </div>
        )}

        {deployStep && <p className="text-xs text-vil-muted">{deployStep}</p>}
        {error && <p className="text-xs text-vil-no">{error}</p>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="mt-1 w-full rounded-xl bg-vil-ember py-3 text-sm font-bold text-vil-bg disabled:opacity-50"
        >
          {submitting
            ? deployStep
              ? t("createMarket.deployingButton")
              : t("createMarket.publishingButton")
            : isEditing
              ? t("createMarket.saveChanges")
              : t("createMarket.publishButton")}
        </button>
      </div>
    </div>
  );
}
