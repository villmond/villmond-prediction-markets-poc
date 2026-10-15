import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectLocale,
  interpolate,
  loadDictionary,
  pluralKey,
  type Dictionary,
  type SupportedLocale,
} from "../utils/i18n.js";

export { SUPPORTED_LOCALES };

const LOCALE_STORAGE_KEY = "villmond:locale-override";

function readStoredLocale(): SupportedLocale | undefined {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return (SUPPORTED_LOCALES as readonly string[]).includes(stored ?? "") ? (stored as SupportedLocale) : undefined;
  } catch {
    return undefined;
  }
}

interface I18nContextValue {
  locale: SupportedLocale;
  /** Translates `key`, optionally interpolating `{var}` placeholders. Falls back to `key` itself if missing. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Count-aware variant: resolves `${key}_<plural category>` via `Intl.PluralRules`, then interpolates `{count}` and `vars`. */
  tn: (key: string, count: number, vars?: Record<string, string | number>) => string;
  /** Manually overrides the browser-detected locale and persists the choice (Profile tab). */
  setLocale: (locale: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/**
 * Detects the browser's language on mount (unless the user previously
 * overrode it via `setLocale`) and loads the matching dictionary from
 * `public/locales/<locale>.json` (see `utils/i18n.ts`). Renders children
 * immediately with English keys as a fallback while the real dictionary
 * loads, rather than blocking the whole app behind a second network
 * round-trip on top of `config.yaml`'s.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => readStoredLocale() ?? detectLocale());
  const [dictionary, setDictionary] = useState<Dictionary>({});

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Best-effort only; a private window or blocked storage just means the choice doesn't persist.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadDictionary(locale)
      .then((dict) => {
        if (!cancelled) setDictionary(dict);
      })
      .catch(() => {
        if (locale === DEFAULT_LOCALE) return;
        // Fall back to the default locale's dictionary rather than showing raw keys.
        loadDictionary(DEFAULT_LOCALE)
          .then((dict) => {
            if (!cancelled) setDictionary(dict);
          })
          .catch(() => {
            // Both the detected and default dictionaries failed to load (offline on first
            // visit, bad deploy, etc.) — the UI falls back to raw translation keys below.
          });
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t: I18nContextValue["t"] = (key, vars) => interpolate(dictionary[key] ?? key, vars);
    const tn: I18nContextValue["tn"] = (key, count, vars) => {
      const resolvedKey = pluralKey(locale, key, count);
      const template = dictionary[resolvedKey] ?? dictionary[`${key}_other`] ?? resolvedKey;
      return interpolate(template, { count, ...vars });
    };
    return { locale, t, tn, setLocale };
  }, [locale, dictionary, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
