import { useEffect, useState } from "react";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { Event as NostrEvent } from "nostr-tools";
import { buildProfileMetadataEvent } from "@villmond/nostr/profile.js";
import { useProfile } from "../hooks/useProfile.js";
import { hexToBytes } from "../utils/hex.js";

interface Props {
  identity: VillmondKeypair | undefined;
  minaAddress: string | undefined;
  relayClient: MarketRelayClient | null;
  onPublish: (event: NostrEvent) => void;
}

const inputClass =
  "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint";

/**
 * Every user's profile: editable display details (published as a standard
 * NIP-01 kind:0 event, so it shows up in any Nostr client) plus their
 * identity/key export — moved here from the old Expert-mode panel so
 * backing up your nsec isn't locked behind the now admin-only Expert tab.
 */
export function ProfileTab({ identity, minaAddress, relayClient, onPublish }: Props) {
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
      setError(err instanceof Error ? err.message : "Could not save profile.");
    }
  }

  if (!identity) {
    return <p className="mx-4 mt-4 text-sm text-vil-muted">Loading…</p>;
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-3.5 pb-4 text-sm">
      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">Your profile</h3>

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
          placeholder="Display name"
          className={inputClass}
        />
        <textarea
          value={about}
          onChange={(e) => {
            setAbout(e.target.value);
            setTouched(true);
          }}
          placeholder="About"
          rows={2}
          className={inputClass}
        />
        <input
          value={picture}
          onChange={(e) => {
            setPicture(e.target.value);
            setTouched(true);
          }}
          placeholder="Avatar URL (https://…)"
          className={inputClass}
        />

        {error && <p className="text-xs text-vil-no">{error}</p>}
        {saved && !error && <p className="text-xs text-vil-yes">Profile published.</p>}

        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-vil-ember py-2.5 text-sm font-bold text-vil-bg"
        >
          Save profile
        </button>
        <p className="text-[11px] text-vil-faint">
          Published as a standard Nostr profile (kind 0) — visible to any Nostr client, not just this app.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">Identity</h3>
        <div>
          <p className="mb-1 text-[11px] text-vil-faint">npub</p>
          <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">
            {identity.npub}
          </code>
        </div>
        <div>
          <p className="mb-1 text-[11px] text-vil-faint">nsec (keep private — back this up)</p>
          <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">
            {identity.nsec}
          </code>
        </div>
        {minaAddress && (
          <div>
            <p className="mb-1 text-[11px] text-vil-faint">Mina wallet address</p>
            <code className="block break-all font-mono text-[11px] leading-relaxed text-[#B9A6FF]">
              {minaAddress}
            </code>
          </div>
        )}
      </section>
    </div>
  );
}
