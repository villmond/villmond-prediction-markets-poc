import { useMemo, useState } from "react";
import { buildMarketRetractionEvent, UNCATEGORIZED_CATEGORY } from "@villmond/nostr/marketEvents.js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { Event as NostrEvent } from "nostr-tools";
import { MarketCard } from "./MarketCard.js";
import { CreateMarketModal } from "./CreateMarketModal.js";
import type { MarketListing } from "../hooks/useMarketEvents.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import { hexToBytes } from "../utils/hex.js";
import { useI18n } from "../context/I18nContext.js";

type SortBy = "closing" | "creation";
type OpenClosedTab = "open" | "closed";
const ALL_CATEGORIES = "all";

interface Props {
  markets: MarketListing[];
  identity: VillmondKeypair | undefined;
  minaWallet: MinaWallet | undefined;
  categories: string[];
  participantCounts: Map<string, number>;
  onPublish: (event: NostrEvent) => void;
}

/** Module-level (not inline in the component body) so `Date.now()` isn't called directly during render — see CreateMarketModal's identical fix. */
function isMarketOpen(closesAt: number): boolean {
  return closesAt * 1000 > Date.now();
}

export function MarketList({ markets, identity, minaWallet, categories, participantCounts, onPublish }: Props) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [editingMarket, setEditingMarket] = useState<MarketListing | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);
  const [sortBy, setSortBy] = useState<SortBy>("closing");
  const [onlyMine, setOnlyMine] = useState(false);
  const [tab, setTab] = useState<OpenClosedTab>("open");
  const [search, setSearch] = useState("");

  // Union of configured categories and whatever categories actually show up
  // on live markets, so a category removed from config.yaml (or used by an
  // older market) still has a working filter entry instead of silently
  // hiding those markets from the dropdown.
  const availableCategories = useMemo(() => {
    const set = new Set(categories);
    for (const listing of markets) set.add(listing.params.category);
    return [...set];
  }, [categories, markets]);

  const visibleMarkets = useMemo(() => {
    let list = markets.filter((listing) => isMarketOpen(listing.params.closesAt) === (tab === "open"));
    if (selectedCategory !== ALL_CATEGORIES) {
      list = list.filter((listing) => listing.params.category === selectedCategory);
    }
    if (onlyMine && identity) {
      list = list.filter((listing) => listing.pubkey === identity.publicKeyHex);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((listing) => listing.params.question.toLowerCase().includes(query));
    }
    return [...list].sort((a, b) =>
      sortBy === "creation" ? b.createdAt - a.createdAt : a.params.closesAt - b.params.closesAt,
    );
  }, [markets, tab, selectedCategory, onlyMine, identity, search, sortBy]);

  function retractMarket(listing: MarketListing) {
    if (!identity) return;
    onPublish(buildMarketRetractionEvent(listing.params.marketId, hexToBytes(identity.secretKeyHex)));
  }

  const inputClass =
    "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2 text-[12px] text-slate-100 placeholder:text-vil-faint";

  function categoryLabel(category: string): string {
    return category === UNCATEGORIZED_CATEGORY
      ? t("market.uncategorized")
      : category.charAt(0).toUpperCase() + category.slice(1);
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-3 pb-2">
      <button
        type="button"
        disabled={!identity}
        onClick={() => setCreating(true)}
        className="w-full rounded-xl border border-dashed border-vil-line py-3 text-sm font-bold text-vil-ember disabled:opacity-50"
      >
        {t("markets.newMarket")}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("open")}
          className={
            "flex-1 rounded-lg py-2 text-xs font-bold " +
            (tab === "open" ? "bg-vil-accent text-vil-bg" : "bg-[#100E1A] text-vil-muted")
          }
        >
          {t("markets.tabOpen")}
        </button>
        <button
          type="button"
          onClick={() => setTab("closed")}
          className={
            "flex-1 rounded-lg py-2 text-xs font-bold " +
            (tab === "closed" ? "bg-vil-accent text-vil-bg" : "bg-[#100E1A] text-vil-muted")
          }
        >
          {t("markets.tabClosed")}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("markets.searchPlaceholder")}
        className={inputClass}
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={inputClass}
          aria-label={t("markets.categoryFilterLabel")}
        >
          <option value={ALL_CATEGORIES}>{t("markets.filterAll")}</option>
          {availableCategories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className={inputClass}
          aria-label={t("markets.sortLabel")}
        >
          <option value="closing">{t("markets.sortClosing")}</option>
          <option value="creation">{t("markets.sortCreated")}</option>
        </select>
      </div>

      {identity && (
        <label className="flex items-center gap-2 text-xs font-bold text-vil-muted">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          {t("markets.filterMine")}
        </label>
      )}

      {visibleMarkets.length === 0 ? (
        <p className="mt-2 text-center text-sm text-vil-muted">{t("markets.empty")}</p>
      ) : (
        visibleMarkets.map((listing) => (
          <MarketCard
            key={listing.params.marketId}
            listing={listing}
            identity={identity}
            minaWallet={minaWallet}
            participantCount={participantCounts.get(listing.eventId)}
            onEdit={() => setEditingMarket(listing)}
            onRetract={() => retractMarket(listing)}
            onPublish={onPublish}
          />
        ))
      )}

      {(creating || editingMarket) && (
        <CreateMarketModal
          identity={identity}
          minaWallet={minaWallet}
          categories={categories}
          editingMarket={editingMarket ?? undefined}
          onPublish={onPublish}
          onClose={() => {
            setCreating(false);
            setEditingMarket(null);
          }}
        />
      )}
    </div>
  );
}
