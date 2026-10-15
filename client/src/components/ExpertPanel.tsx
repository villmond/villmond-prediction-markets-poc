import type { Event as NostrEvent } from "nostr-tools";

interface Props {
  relays: string[];
  rawEvents: NostrEvent[];
}

/**
 * Admin-only panel: connected relays, raw Nostr event log (PRD 4). Key
 * export moved to the Profile tab (available to everyone, not just the
 * admin) — see ProfileTab.tsx.
 */
export function ExpertPanel({ relays, rawEvents }: Props) {
  return (
    <div className="mx-4 mt-4 flex flex-col gap-3.5 text-sm">
      <section className="rounded-2xl border border-vil-line bg-vil-surface p-4">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          Connected relays
        </h3>
        <ul className="mt-2.5 space-y-[7px]">
          {relays.map((relay) => (
            <li key={relay} className="flex items-center gap-2">
              <span className="h-[7px] w-[7px] rounded-full bg-vil-yes" />
              <span className="font-mono text-xs text-[#C9C4DE]">{relay}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2.5 rounded-2xl border border-vil-line bg-vil-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
            Raw event log
          </h3>
          <span className="text-[11px] text-vil-faint">{rawEvents.length}</span>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl bg-[#100E1A] p-3">
          {rawEvents.length === 0 ? (
            <p className="text-xs text-vil-muted">No events received yet.</p>
          ) : (
            rawEvents.map((event) => (
              <pre key={event.id} className="mb-2 overflow-x-auto font-mono text-[10px] leading-relaxed text-vil-muted">
                {JSON.stringify(event, null, 2)}
              </pre>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
