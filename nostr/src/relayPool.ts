import { SimplePool, type Event as NostrEvent } from "nostr-tools";
import { MARKET_CREATION_KIND, parseMarketCreationEvent, type CreateMarketParams } from "./marketEvents.js";
import { CASHIER_ORDER_KIND, parseCashierOrderEvent, type CashierOrderParams } from "./cashierOrders.js";
import { ORACLE_RATING_KIND, parseOracleRatingEvent, type OracleRating } from "./oracleReputation.js";

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

  /** Subscribes to P2P Cashier liquidity quotes, skipping any that fail to parse. */
  subscribeToCashierOrders(
    onOrder: (order: CashierOrderParams, event: NostrEvent) => void,
    onRawEvent?: (event: NostrEvent) => void,
  ) {
    return this.pool.subscribeMany(
      this.relays,
      { kinds: [CASHIER_ORDER_KIND] },
      {
        onevent(event) {
          onRawEvent?.(event);
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

  /** Broadcasts a signed event (e.g. a bet placement) to all configured relays. */
  publish(event: NostrEvent): Promise<string>[] {
    return this.pool.publish(this.relays, event);
  }

  close(): void {
    this.pool.destroy();
  }
}
