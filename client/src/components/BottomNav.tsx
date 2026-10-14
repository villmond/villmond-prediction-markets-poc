import { useMode } from "../context/ModeContext.js";

/** Mobile tab bar driving the real Newbie/Expert mode state (replaces the old top-right pill toggle). */
export function BottomNav() {
  const { mode, setMode } = useMode();

  return (
    <nav className="flex items-center justify-around border-t border-vil-line bg-[#0e0c18] px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5">
      <button
        type="button"
        onClick={() => setMode("newbie")}
        aria-pressed={mode === "newbie"}
        className="flex flex-col items-center gap-1"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 11 L12 4 L20 11 V20 H4 Z"
            stroke={mode === "newbie" ? "#8B5CF6" : "#716C8A"}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <span className={"text-[10px] font-bold " + (mode === "newbie" ? "text-vil-accent" : "text-[#716C8A] font-semibold")}>
          Markets
        </span>
      </button>

      <button
        type="button"
        onClick={() => setMode("expert")}
        aria-pressed={mode === "expert"}
        className="flex flex-col items-center gap-1"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 18 L9 11 L13 15 L20 6"
            stroke={mode === "expert" ? "#8B5CF6" : "#716C8A"}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={"text-[10px] font-bold " + (mode === "expert" ? "text-vil-accent" : "text-[#716C8A] font-semibold")}>
          Expert
        </span>
      </button>
    </nav>
  );
}
