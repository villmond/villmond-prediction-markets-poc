import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Markets and Profile are open to everyone; Oracle/Cashier/Expert are
 * role-gated tabs (see `utils/roles.ts`'s `isViewAllowed` — cosmetic UX
 * only, not real access control, per ADMINISTRATION.md §0).
 */
export type UxView = "markets" | "balance" | "oracle" | "cashier" | "expert" | "profile";

const STORAGE_KEY = "villmond:ux-mode";
const VALID_VIEWS: readonly UxView[] = ["markets", "balance", "oracle", "cashier", "expert", "profile"];

interface ModeContextValue {
  view: UxView;
  setView: (view: UxView) => void;
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

function readStoredView(): UxView {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "newbie") return "markets"; // legacy value from the old binary Newbie/Expert toggle
    return (VALID_VIEWS as string[]).includes(stored ?? "") ? (stored as UxView) : "markets";
  } catch {
    return "markets";
  }
}

/** Multi-tab navigation state: which of the role-gated tabs is active (PRD section 4). */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<UxView>(readStoredView);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // Best-effort only; a private window or blocked storage must not break navigation.
    }
  }, [view]);

  return <ModeContext.Provider value={{ view, setView }}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within a ModeProvider");
  return ctx;
}
