import { useEffect, useState } from "react";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { Event as NostrEvent } from "nostr-tools";
import { buildProfileMetadataEvent } from "@villmond/nostr/profile.js";
import { useProfile } from "../hooks/useProfile.js";
import { hexToBytes } from "../utils/hex.js";
import { useI18n, SUPPORTED_LOCALES } from "../context/I18nContext.js";
import type { SupportedLocale } from "../utils/i18n.js";
import { useActionHistory } from "../hooks/useActionHistory.js";
import { resetAppData } from "../utils/resetApp.js";
import { CopyButton } from "./CopyButton.js";

interface Props {
  identity: VillmondKeypair | undefined;
  relayClient: MarketRelayClient | null;
  /** Replaces the local identity (and, transitively, the Mina wallet derived from it) with the one for a pasted nsec. */
  onImportIdentity: (nsec: string) => Promise<void>;
  onPublish: (event: NostrEvent) => void;
}

const inputClass =
  "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint";

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "en-GB": "English (UK)",
  "es-AR": "Español (Argentina)",
  "pt-BR": "Português (Brasil)",
};

/**
 * Every user's profile: editable display details (published as a standard
 * NIP-01 kind:0 event, so it shows up in any Nostr client) plus their
 * identity/key export — moved here from the old Expert-mode panel so
 * backing up your nsec isn't locked behind the now admin-only Expert tab.
 */
export function ProfileTab({ identity, relayClient, onImportIdentity, onPublish }: Props) {
  const { t, locale, setLocale } = useI18n();
  const { actions } = useActionHistory();
  const profile = useProfile(relayClient, identity?.publicKeyHex);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showIdentityImport, setShowIdentityImport] = useState(false);
  const [identityImportValue, setIdentityImportValue] = useState("");
  const [identityImportError, setIdentityImportError] = useState<string | undefined>(undefined);
  const [importingIdentity, setImportingIdentity] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>(undefined);

  async function doImportIdentity() {
    setImportingIdentity(true);
    setIdentityImportError(undefined);
    try {
      await onImportIdentity(identityImportValue);
      setIdentityImportValue("");
      setShowIdentityImport(false);
    } catch (err) {
      setIdentityImportError(err instanceof Error ? err.message : t("profile.importIdentityErrorGeneric"));
    } finally {
      setImportingIdentity(false);
    }
  }

  async function doReset() {
    setResetting(true);
    setResetError(undefined);
    try {
      await resetAppData();
      window.location.reload();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : t("profile.resetErrorGeneric"));
      setResetting(false);
    }
  }

  useEffect(() => {
    if (touched) return;
    setName(profile?.name ?? "");
    setAbout(profile?.about ?? "");
    setPicture(profile?.picture ?? "");
  }, [profile, touched]);

  function save() {
    if (!identity) return;
    setError(null);
    setSaved(false);
    try {
      const event = buildProfileMetadataEvent(
        {
          name: name.trim() || undefined,
          about: about.trim() || undefined,
          picture: picture.trim() || undefined,
        },
        hexToBytes(identity.secretKeyHex),
      );
      onPublish(event);
      setTouched(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.saveErrorGeneric"));
    }
  }

  if (!identity) {
    return <p className="mx-4 mt-4 text-sm text-vil-muted">{t("common.loading")}</p>;
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-3.5 pb-4 text-sm">
      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("profile.yourProfile")}
        </h3>

        {picture && (
          <img
            src={picture}
            alt=""
            className="h-16 w-16 rounded-full border border-vil-line object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}

        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setTouched(true);
          }}
          placeholder={t("profile.namePlaceholder")}
          className={inputClass}
        />
        <textarea
          value={about}
          onChange={(e) => {
            setAbout(e.target.value);
            setTouched(true);
          }}
          placeholder={t("profile.aboutPlaceholder")}
          rows={2}
          className={inputClass}
        />
        <input
          value={picture}
          onChange={(e) => {
            setPicture(e.target.value);
            setTouched(true);
          }}
          placeholder={t("profile.avatarPlaceholder")}
          className={inputClass}
        />

        {error && <p className="text-xs text-vil-no">{error}</p>}
        {saved && !error && <p className="text-xs text-vil-yes">{t("profile.published")}</p>}

        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-vil-ember py-2.5 text-sm font-bold text-vil-bg"
        >
          {t("profile.save")}
        </button>
        <p className="text-[11px] text-vil-faint">{t("profile.publishNote")}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("profile.identity")}
        </h3>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] text-vil-faint">{t("profile.npub")}</p>
            <CopyButton value={identity.npub} />
          </div>
          <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">
            {identity.npub}
          </code>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] text-vil-faint">{t("profile.nsec")}</p>
            <CopyButton value={identity.nsec} />
          </div>
          <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">
            {identity.nsec}
          </code>
        </div>
        <div className="border-t border-vil-line pt-3">
          {showIdentityImport ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-vil-faint">{t("profile.importIdentityWarning")}</p>
              <input
                value={identityImportValue}
                onChange={(e) => setIdentityImportValue(e.target.value)}
                placeholder={t("profile.importIdentityPlaceholder")}
                className={inputClass}
              />
              {identityImportError && <p className="text-xs text-vil-no">{identityImportError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={importingIdentity || !identityImportValue.trim()}
                  onClick={() => void doImportIdentity()}
                  className="flex-1 rounded-lg bg-vil-ember py-2 text-xs font-bold text-vil-bg disabled:opacity-50"
                >
                  {importingIdentity ? t("profile.importingIdentity") : t("profile.importIdentityConfirm")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowIdentityImport(false);
                    setIdentityImportValue("");
                    setIdentityImportError(undefined);
                  }}
                  className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-muted"
                >
                  {t("profile.importIdentityCancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowIdentityImport(true)}
              className="text-[11px] font-bold text-vil-ember"
            >
              {t("profile.importIdentity")}
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("profile.language")}
        </h3>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as SupportedLocale)}
          className={inputClass}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("profile.recentActivity")}
        </h3>
        {actions.length === 0 ? (
          <p className="text-xs text-vil-muted">{t("profile.noActivity")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {actions.map((action) => (
              <li key={action.id} className="rounded-xl bg-[#15131F] p-3 text-xs">
                <p className="font-bold text-slate-200">{t(`history.${action.type}`)}</p>
                <p className="mt-0.5 text-vil-faint">{action.detail}</p>
                <p className="mt-1 text-[10px] text-vil-faint">{new Date(action.timestamp).toLocaleString(locale)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-vil-no/35 bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-no">
          {t("profile.dangerZone")}
        </h3>
        {showResetConfirm ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-vil-faint">{t("profile.resetWarning")}</p>
            {resetError && <p className="text-xs text-vil-no">{resetError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => void doReset()}
                className="flex-1 rounded-lg border border-vil-no/35 bg-vil-no/10 py-2 text-xs font-bold text-vil-no disabled:opacity-50"
              >
                {resetting ? t("profile.resetting") : t("profile.resetConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-lg border border-vil-line py-2 text-xs font-bold text-vil-muted"
              >
                {t("profile.resetCancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="text-left text-[11px] font-bold text-vil-no"
          >
            {t("profile.resetApp")}
          </button>
        )}
      </section>
    </div>
  );
}
