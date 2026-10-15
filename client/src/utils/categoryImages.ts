/**
 * Local (bundled, never fetched over the network) default cover image per
 * market category. `config.yaml`'s `markets.categories` is open-ended — a
 * white-label deployer can add as many as they like — so this only ships
 * art for the three starter categories plus a generic fallback; any other
 * category value (including `UNCATEGORIZED_CATEGORY`) just gets the
 * generic fallback rather than a missing-asset error.
 */
const CATEGORY_IMAGE_FILES: Record<string, string> = {
  sports: "sports.svg",
  technology: "technology.svg",
  politics: "politics.svg",
};

const DEFAULT_CATEGORY_IMAGE = "/assets/categories/_default.svg";

/** Returns the bundled default image path for a category, normalizing case/whitespace. */
export function getCategoryDefaultImage(category: string): string {
  const key = category.trim().toLowerCase();
  const file = CATEGORY_IMAGE_FILES[key];
  return file ? `/assets/categories/${file}` : DEFAULT_CATEGORY_IMAGE;
}
