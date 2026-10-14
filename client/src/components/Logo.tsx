interface Props {
  /** White-label display name from `config.yaml`'s `app.name` — never hardcoded. */
  name: string;
  size?: number;
  withWordmark?: boolean;
}

/** Brand mark: a geometric "V" with a node dot, reading as both a verified prediction and a Nostr relay node. */
export function Logo({ name, size = 26, withWordmark = true }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${name} logo mark`}>
        <defs>
          <linearGradient id="vl-mark-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#FF7A45" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#vl-mark-grad)" />
        <path
          d="M10 11 L20 27 L30 11"
          fill="none"
          stroke="#0B0A14"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="27" r="2.8" fill="#FFFFFF" />
      </svg>
      {withWordmark && <span className="font-display text-[17px] font-bold">{name}</span>}
    </div>
  );
}
