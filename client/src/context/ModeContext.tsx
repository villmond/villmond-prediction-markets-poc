import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UxMode = "newbie" | "expert";

const STORAGE_KEY = "villmond:ux-mode";

interface ModeContextValue {
  mode: UxMode;
  setMode: (mode: UxMode) => void;
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

function readStoredMode(): UxMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "expert" ? "expert" : "newbie";
  } catch {
    return "newbie";
  }
}

/** Dual-UX toggle: Newbie Mode (default, guided) vs Expert Mode (PRD section 4). */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<UxMode>(readStoredMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Best-effort only; a private window or blocked storage must not break mode switching.
    }
  }, [mode]);

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within a ModeProvider");
  return ctx;
}
