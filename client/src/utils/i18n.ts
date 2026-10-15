/**
 * Minimal, dependency-free i18n: locale dictionaries are plain JSON files
 * fetched at runtime (`public/locales/<locale>.json`), the same pattern
 * `config.ts` already uses for `config.yaml` — a translator can fix or add
 * a language on the deployed host without a rebuild (see ADMINISTRATION.md).
 */

export const SUPPORTED_LOCALES = ["en-GB", "es-AR", "pt-BR"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en-GB";

export type Dictionary = Record<string, string>;

/** Matches a browser language tag to a supported locale: exact match, then same base language, then the default. */
export function detectLocale(candidates: readonly string[] = navigator.languages ?? [navigator.language]): SupportedLocale {
  for (const candidate of candidates) {
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const base = candidate.split("-")[0]?.toLowerCase();
    const match = SUPPORTED_LOCALES.find((locale) => locale.split("-")[0]?.toLowerCase() === base);
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}

function isDictionary(value: unknown): value is Dictionary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

const cache = new Map<SupportedLocale, Promise<Dictionary>>();

/** Fetches and validates a locale's dictionary, caching the in-flight/settled promise per locale. */
export function loadDictionary(locale: SupportedLocale): Promise<Dictionary> {
  const cached = cache.get(locale);
  if (cached) return cached;

  const promise = fetch(`/locales/${locale}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch /locales/${locale}.json: HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((parsed) => {
      if (!isDictionary(parsed)) throw new Error(`/locales/${locale}.json is not a flat string dictionary`);
      return parsed;
    });

  cache.set(locale, promise);
  return promise;
}

/** `{name}`-style interpolation — the only substitution this minimal system supports. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * Resolves a plural-aware key: `${key}_${category}` (e.g. `balance.staked_one`
 * / `balance.staked_other`), falling back to `${key}_other` if the exact
 * CLDR category (via `Intl.PluralRules`) isn't present in the dictionary.
 */
export function pluralKey(locale: SupportedLocale, key: string, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  return `${key}_${category}`;
}
