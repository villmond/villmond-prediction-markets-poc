import { useState } from "react";
import { useI18n } from "../context/I18nContext.js";

const STORAGE_KEY = "villmond:onboarding-complete";

const STEP_KEYS = [
  { titleKey: "onboarding.step1.title", bodyKey: "onboarding.step1.body" },
  { titleKey: "onboarding.step2.title", bodyKey: "onboarding.step2.body" },
  { titleKey: "onboarding.step3.title", bodyKey: "onboarding.step3.body" },
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
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(readCompleted);
  const [step, setStep] = useState(0);

  if (dismissed) return null;

  const isLastStep = step === STEP_KEYS.length - 1;
  const current = STEP_KEYS[step];

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

        <h2 className="font-display text-[22px] font-bold leading-tight text-slate-100">{t(current.titleKey)}</h2>
        <p className="text-[15px] leading-relaxed text-[#C9C4DE]">{t(current.bodyKey)}</p>

        <div className="flex gap-1.5">
          {STEP_KEYS.map((_, index) => (
            <span
              key={index}
              className={"h-[5px] w-[22px] rounded-full " + (index === step ? "bg-vil-ember" : "bg-[#39344F]")}
            />
          ))}
        </div>

        <div className="mt-1 flex w-full items-center justify-between">
          <button type="button" onClick={finish} className="px-1 py-2.5 text-sm font-semibold text-vil-muted">
            {t("onboarding.skip")}
          </button>
          <button
            type="button"
            onClick={() => (isLastStep ? finish() : setStep(step + 1))}
            className="rounded-full bg-vil-ember px-[26px] py-[11px] text-sm font-bold text-vil-bg"
          >
            {isLastStep ? t("onboarding.start") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
