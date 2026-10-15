import { SimplePool, type Event as NostrEvent } from "nostr-tools";
import {
  MARKET_CREATION_KIND,
  parseMarketCreationEvent,
  BET_PLACEMENT_KIND,
  parseBetPlacementEvent,
  type CreateMarketParams,
  type BetPlacementParams,
} from "./marketEvents.js";
import {
  CASHIER_ORDER_KIND,
  parseCashierOrderEvent,
  isCashierOrderCancellation,
  type CashierOrderParams,
} from "./cashierOrders.js";
import { ORACLE_RATING_KIND, parseOracleRatingEvent, type OracleRating } from "./oracleReputation.js";
import { PROFILE_METADATA_KIND, parseProfileMetadataEvent, type ProfileMetadata } from "./profile.js";
import { MARKET_PAYOUT_KIND, parseMarketPayoutEvent, type MarketPayoutParams } from "./payout.js";

/**
 * Thin wrapper around nostr-tools' SimplePool, scoped to this app's market
 * event flow. Owns one pool per client so subscribe + publish share
 * connections (PRD 3: "Nostr Relays — high-throughput pub/sub layer for
 * real-time market creation... and betting events").
 */
export class MarketRelayClient {
  private readonly pool = new SimplePool();

  constructor(private readonly relays: string[]) {}

  /** Subscribes to market-creation events, skipping any that fail to parse. */
  subscribeToMarkets(
    onMarket: (market: CreateMarketParams, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [MARKET_CREATION_KIND] },
      {
        onevent(event) {
          onRawEvent?.(event);
          try {
            onMarket(parseMarketCreationEvent(event), event);
          } catch {
            // Non-conforming event sharing this kind; ignore rather than crash the subscription.
          }
        },
      },
    );
  }

  /**
   * Subscribes to P2P Cashier liquidity quotes, skipping any that fail to
   * parse. `onCancellation` fires for a quote retraction (same `d` tag
   * republished with a `cancelled` marker — see `isCashierOrderCancellation`)
   * instead of being silently dropped as a non-conforming event.
   */
  subscribeToCashierOrders(
    onOrder: (order: CashierOrderParams, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
    onCancellation?: (orderId: string, event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [CASHIER_ORDER_KIND] },
      {
        onevent(event) {
          onRawEvent?.(event);
          if (isCashierOrderCancellation(event)) {
            const orderId = event.tags.find((t) => t[0] === "d")?.[1];
            if (orderId) onCancellation?.(orderId, event);
            return;
          }
          try {
            onOrder(parseCashierOrderEvent(event), event);
          } catch {
            // Non-conforming event sharing this kind; ignore rather than crash the subscription.
          }
        },
      },
    );
  }

  /** Subscribes to rating events (kind:1985) targeting a specific oracle's public key. */
  subscribeToOracleRatings(
    oraclePublicKey: string,
    onRating: (rating: OracleRating, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [ORACLE_RATING_KIND], "#p": [oraclePublicKey] },
      {
        onevent(event) {
          onRawEvent?.(event);
          try {
            onRating(parseOracleRatingEvent(event), event);
          } catch {
            // Non-conforming event sharing this kind; ignore rather than crash the subscription.
          }
        },
      },
    );
  }

  /** Subscribes to a specific pubkey's own kind:7001 bet-placement events (Balance tab). */
  subscribeToOwnBets(
    pubkey: string,
    onBet: (bet: BetPlacementParams, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [BET_PLACEMENT_KIND], authors: [pubkey] },
      {
        onevent(event) {
          onRawEvent?.(event);
          try {
            onBet(parseBetPlacementEvent(event), event);
          } catch {
            // Non-conforming event sharing this kind; ignore rather than crash the subscription.
          }
        },
      },
    );
  }

  /** Subscribes to kind:0 profile metadata events authored by a specific pubkey. */
  subscribeToProfile(
    pubkey: string,
    onProfile: (profile: ProfileMetadata, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [PROFILE_METADATA_KIND], authors: [pubkey] },
      {
        onevent(event) {
          onRawEvent?.(event);
          try {
            onProfile(parseProfileMetadataEvent(event), event);
          } catch {
            // Non-conforming event sharing this kind; ignore rather than crash the subscription.
          }
        },
      },
    );
  }

  /** Subscribes to kind:7002 payout records naming a specific pubkey as a recipient (Balance tab). */
  subscribeToPayouts(
    pubkey: string,
    onPayout: (payout: MarketPayoutParams, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [MARKET_PAYOUT_KIND], "#p": [pubkey] },
      {
        onevent(event) {
          onRawEvent?.(event);
          try {
            onPayout(parseMarketPayoutEvent(event), event);
          } catch {
            // Non-conforming event sharing this kind; ignore rather than crash the subscription.
          }
        },
      },
    );
  }

  /**
   * One-shot historical fetch of every bet placed on a market, used by the
   * resolving oracle to compute payout shares — carries each bet's author
   * pubkey (not part of `BetPlacementParams` itself) since that's who the
   * payout is owed to. Not a live subscription — `SimplePool.querySync`
   * waits for relays' EOSE and returns.
   */
  async queryBetsForMarket(marketEventId: string): Promise<(BetPlacementParams & { pubkey: string })[]> {
    const events = await this.pool.querySync(this.relays, { kinds: [BET_PLACEMENT_KIND], "#e": [marketEventId] });
    const bets: (BetPlacementParams & { pubkey: string })[] = [];
    for (const event of events) {
      try {
        bets.push({ ...parseBetPlacementEvent(event), pubkey: event.pubkey });
      } catch {
        // Non-conforming event sharing this kind; skip it.
      }
    }
    return bets;
  }

  /** Per-relay live connection state (Expert panel's relay-status dot). */
  getConnectionStatus(): Map<string, boolean> {
    return this.pool.listConnectionStatus();
  }

  /** Broadcasts a signed event (e.g. a bet placement) to all configured relays. */
  publish(event: NostrEvent): Promise<string>[] {
    return this.pool.publish(this.relays, event);
  }

  close(): void {
    this.pool.destroy();
  }
}
