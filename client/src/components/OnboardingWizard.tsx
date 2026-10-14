import { useState } from "react";

const STORAGE_KEY = "villmond:onboarding-complete";

const STEPS = [
  {
    title: "Welcome to Villmond Markets",
    body: "VILCOIN is a free, risk-free reputation score — it can't be bought, sold, or cashed out. Predict outcomes to build your track record.",
  },
  {
    title: "Odds shift as people bet",
    body: "Each market shows the outcomes people are predicting. As more players weigh in, the odds move to reflect the crowd's view.",
  },
  {
    title: "Ready to predict",
    body: "Tap an outcome on any market to place your first prediction. You can switch to Expert Mode any time for deeper analytics.",
  },
] as const;

function readCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markCompleted() {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Best-effort only; failing to persist just means the wizard reappears next visit.
  }
}

export function OnboardingWizard() {
  const [dismissed, setDismissed] = useState(readCompleted);
  const [step, setStep] = useState(0);

  if (dismissed) return null;

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step];

  function finish() {
    markCompleted();
    setDismissed(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-[18px] rounded-[24px] border border-vil-line bg-vil-surface p-8 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "radial-gradient(circle at 30% 30%, #8B5CF6, #5B32B0)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" stroke="#F4F2FF" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8.5 12 L11 14.5 L16 9" stroke="#F4F2FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="font-display text-[22px] font-bold leading-tight text-slate-100">{current.title}</h2>
        <p className="text-[15px] leading-relaxed text-[#C9C4DE]">{current.body}</p>

        <div className="flex gap-1.5">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={"h-[5px] w-[22px] rounded-full " + (index === step ? "bg-vil-ember" : "bg-[#39344F]")}
            />
          ))}
        </div>

        <div className="mt-1 flex w-full items-center justify-between">
          <button type="button" onClick={finish} className="px-1 py-2.5 text-sm font-semibold text-vil-muted">
            Skip
          </button>
          <button
            type="button"
            onClick={() => (isLastStep ? finish() : setStep(step + 1))}
            className="rounded-full bg-vil-ember px-[26px] py-[11px] text-sm font-bold text-vil-bg"
          >
            {isLastStep ? "Start predicting" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
