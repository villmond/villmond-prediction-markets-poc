import { Logo } from "./Logo.js";

interface Props {
  error?: string;
}

/** Branded full-screen loading/error state shown while config.yaml is being fetched. */
export function SplashScreen({ error }: Props) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-vil-bg px-6 text-center">
      <Logo name="Loading" withWordmark={false} size={56} />
      {error ? (
        <p className="max-w-xs text-sm text-vil-no">Failed to load configuration: {error}</p>
      ) : (
        <>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-vil-surface-raised">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-vil-accent" />
          </div>
          <p className="text-xs text-vil-muted">Loading…</p>
        </>
      )}
    </div>
  );
}
