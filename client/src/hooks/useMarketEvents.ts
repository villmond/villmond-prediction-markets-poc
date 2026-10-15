import { useEffect, useMemo, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { CreateMarketParams } from "@villmond/nostr/marketEvents.js";
import type { Event as NostrEvent } from "nostr-tools";

const RAW_LOG_LIMIT = 50;

export interface MarketListing {
  params: CreateMarketParams;
  /** Id of the signed `kind:30000` event, needed as the `e` tag on a bet placement. */
  eventId: string;
  /** Author pubkey (hex) of the creation event — drives the "created by me" filter. */
  pubkey: string;
  /** Unix timestamp (seconds) the creation event was signed — drives "sort by creation date". */
  createdAt: number;
}

export interface UseMarketEventsResult {
  markets: MarketListing[];
  rawEvents: NostrEvent[];
}

/** Subscribes to live market-creation events over a shared relay client (PRD 5.3). */
export function useMarketEvents(client: MarketRelayClient | null): UseMarketEventsResult {
  const [markets, setMarkets] = useState<Map<string, MarketListing>>(new Map());
  const [rawEvents, setRawEvents] = useState<NostrEvent[]>([]);

  useEffect(() => {
    if (!client) return;

    setMarkets(new Map());
    setRawEvents([]);

    const sub = client.subscribeToMarkets(
      (market, event) => {
        setMarkets((prev) =>
          new Map(prev).set(market.marketId, {
            params: market,
            eventId: event.id,
            pubkey: event.pubkey,
            createdAt: event.created_at,
          }),
        );
      },
      (event) => {
        setRawEvents((prev) => [event, ...prev].slice(0, RAW_LOG_LIMIT));
      },
    );

    return () => sub.close();
  }, [client]);

  const marketList = useMemo(() => [...markets.values()], [markets]);

  return { markets: marketList, rawEvents };
}
