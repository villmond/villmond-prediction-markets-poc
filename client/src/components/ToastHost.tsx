import { useToast } from "../context/ToastContext.js";

/** Renders the active toast queue, fixed above everything else including the bottom nav. */
export function ToastHost() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(14px+env(safe-area-inset-top))] z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={
            "pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-lg " +
            (toast.tone === "error"
              ? "border-vil-no/40 bg-[#2A1420] text-vil-no"
              : toast.tone === "success"
                ? "border-vil-yes/40 bg-[#122A22] text-vil-yes"
                : "border-vil-line bg-vil-surface text-slate-100")
          }
        >
          <span>{toast.message}</span>
          <div className="flex items-center gap-2">
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
                className="rounded-lg bg-vil-ember px-2.5 py-1 text-[11px] font-bold text-vil-bg"
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" onClick={() => dismiss(toast.id)} className="text-[11px] text-vil-faint" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
