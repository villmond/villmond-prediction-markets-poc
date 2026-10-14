import type { UserRole } from "../utils/roles.js";

const LABELS: Record<UserRole, string> = {
  admin: "Platform admin (fee recipient)",
  oracle: "Designated oracle",
  cashier: "Designated cashier",
};

/** Informational-only role chips — see `utils/roles.ts` for why these never gate anything. */
export function RoleBadges({ roles }: { roles: UserRole[] }) {
  if (roles.length === 0) return null;

  return (
    <div className="mx-4 mt-3 flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <span
          key={role}
          className="rounded-full border border-vil-accent/30 bg-vil-accent/10 px-2.5 py-1 text-[11px] font-bold text-[#B9A6FF]"
        >
          {LABELS[role]}
        </span>
      ))}
    </div>
  );
}
