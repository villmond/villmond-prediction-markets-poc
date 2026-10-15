import { useState } from "react";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { Event as NostrEvent } from "nostr-tools";
import { MarketCard } from "./MarketCard.js";
import { CreateMarketModal } from "./CreateMarketModal.js";
import type { MarketListing } from "../hooks/useMarketEvents.js";
import type { MinaWallet } from "../hooks/useMinaWallet.js";
import { useI18n } from "../context/I18nContext.js";

interface Props {
  markets: MarketListing[];
  identity: VillmondKeypair | undefined;
  minaWallet: MinaWallet | undefined;
  onPublish: (event: NostrEvent) => void;
}

export function MarketList({ markets, identity, minaWallet, onPublish }: Props) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);

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

      {markets.length === 0 ? (
        <p className="mt-2 text-center text-sm text-vil-muted">{t("markets.empty")}</p>
      ) : (
        markets.map((listing) => (
          <MarketCard
            key={listing.params.marketId}
            listing={listing}
            identity={identity}
            minaWallet={minaWallet}
            onPublish={onPublish}
          />
        ))
      )}

      {creating && (
        <CreateMarketModal
          identity={identity}
          minaWallet={minaWallet}
          onPublish={onPublish}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
