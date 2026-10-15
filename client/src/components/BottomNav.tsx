import { useMode, type UxView } from "../context/ModeContext.js";
import { isViewAllowed, type UserRole } from "../utils/roles.js";
import { useI18n } from "../context/I18nContext.js";

interface Props {
  roles: UserRole[];
  cashierEnabled: boolean;
}

interface Tab {
  view: UxView;
  labelKey: string;
  d: string;
}

const ALL_TABS: Tab[] = [
  { view: "markets", labelKey: "nav.markets", d: "M4 11 L12 4 L20 11 V20 H4 Z" },
  { view: "balance", labelKey: "nav.balance", d: "M4 10h16M4 10l8-6 8 6M4 10v9h16v-9M9 14v3M15 14v3" },
  {
    view: "oracle",
    labelKey: "nav.oracle",
    d: "M2 12 C5 6, 19 6, 22 12 C19 18, 5 18, 2 12 Z M12 15a3 3 0 100-6 3 3 0 000 6Z",
  },
  { view: "cashier", labelKey: "nav.cashier", d: "M4 7h13M13 3l4 4-4 4M20 17H7M11 21l-4-4 4-4" },
  { view: "expert", labelKey: "nav.expert", d: "M4 18 L9 11 L13 15 L20 6" },
  { view: "profile", labelKey: "nav.profile", d: "M12 12a4 4 0 100-8 4 4 0 000 8ZM4 20c0-4 4-6 8-6s8 2 8 6" },
];

/**
 * Mobile tab bar driving the real view state. Oracle/Cashier/Expert tabs
 * are shown per role (`isViewAllowed`) — UX convenience, not access
 * control: a client-side-only PWA with no login can't enforce a real
 * restriction, so this only decides what's shown, never what's allowed to
 * happen on-chain (ADMINISTRATION.md §0).
 */
export function BottomNav({ roles, cashierEnabled }: Props) {
  const { view, setView } = useMode();
  const { t } = useI18n();
  const tabs = ALL_TABS.filter((tab) => isViewAllowed(tab.view, roles, cashierEnabled));

  return (
    <nav className="flex items-center justify-around border-t border-vil-line bg-[#0e0c18] px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5">
      {tabs.map((tab) => {
        const active = view === tab.view;
        return (
          <button
            key={tab.view}
            type="button"
            onClick={() => setView(tab.view)}
            aria-pressed={active}
            className="flex flex-col items-center gap-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d={tab.d}
                stroke={active ? "#8B5CF6" : "#716C8A"}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={"text-[10px] font-bold " + (active ? "text-vil-accent" : "text-[#716C8A] font-semibold")}>
              {t(tab.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
