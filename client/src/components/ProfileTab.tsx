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
import { CopyButton } from "./CopyButton.js";

interface Props {
  identity: VillmondKeypair | undefined;
  minaAddress: string | undefined;
  relayClient: MarketRelayClient | null;
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
export function ProfileTab({ identity, minaAddress, relayClient, onPublish }: Props) {
  const { t, locale, setLocale } = useI18n();
  const { actions } = useActionHistory();
  const profile = useProfile(relayClient, identity?.publicKeyHex);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
        {minaAddress && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] text-vil-faint">{t("profile.minaAddress")}</p>
              <CopyButton value={minaAddress} />
            </div>
            <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">
              {minaAddress}
            </code>
          </div>
        )}
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
    </div>
  );
}
