import { useState } from "react";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";

interface Props {
  identity: VillmondKeypair;
}

/** Non-intrusive backup reminder for a freshly generated identity (PRD 5.2). */
export function IdentityBackupBanner({ identity }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-vil-line bg-vil-surface p-[14px] text-sm">
      <p className="text-slate-200">
        Save your backup key to use this account on another device. Nobody can recover it for you.
      </p>
      {revealed ? (
        <code className="mt-2 block break-all rounded-lg bg-[#100E1A] p-2.5 text-xs text-vil-accent">
          {identity.nsec}
        </code>
      ) : (
        <button type="button" onClick={() => setRevealed(true)} className="mt-2 text-xs font-bold text-vil-ember">
          Reveal backup key
        </button>
      )}
      <button type="button" onClick={() => setDismissed(true)} className="mt-2 block text-xs font-semibold text-vil-muted">
        Dismiss
      </button>
    </div>
  );
}
