import { finalizeEvent, type EventTemplate, type Event as NostrEvent } from "nostr-tools";

/**
 * P2P Cashier liquidity quote event kind, per PRD roadmap Phase 4 ("Build
 * P2P Cashier discovery via Nostr (kind: 30078)") — a NIP-78 arbitrary
 * app-data, parameterized-replaceable kind, so a Cashier can update/retract
 * a live quote by republishing the same `d` tag.
 *
 * PRD 6.1 calls these broadcasts "encrypted"; a quote must stay publicly
 * readable for strangers to discover and match against it, so "encrypted"
 * here means transport encryption (wss:// relay connections, already used
 * throughout this app), not payload encryption — there is no single
 * recipient key to encrypt a broadcast *to*.
 */
export const CASHIER_ORDER_KIND = 30078;

export type CashierOrderSide = "buy" | "sell";
export type CashierCurrency = "USD" | "EUR" | "ZEC" | "CASH_P2P";

export interface CashierOrderParams {
  /** Stable id for this quote, used as the replaceable event's `d` tag. */
  orderId: string;
  /** From the Cashier's perspective: selling VILCOIN for `currency`, or buying it. */
  side: CashierOrderSide;
  currency: CashierCurrency;
  /** VILCOIN amount available at this quote. */
  amountVilcoin: number;
  /** Price in `currency` per 1 VILCOIN. */
  pricePerVilcoin: number;
  /** Coarse geohash (PRD 6.1: "coarse, privacy-preserving geohashes"). */
  geohash: string;
}

export function buildCashierOrderEvent(params: CashierOrderParams, secretKey: Uint8Array): NostrEvent {
  if (!Number.isFinite(params.amountVilcoin) || params.amountVilcoin <= 0) {
    throw new Error("amountVilcoin must be a positive, finite number");
  }
  if (!Number.isFinite(params.pricePerVilcoin) || params.pricePerVilcoin <= 0) {
    throw new Error("pricePerVilcoin must be a positive, finite number");
  }

  const template: EventTemplate = {
    kind: CASHIER_ORDER_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", params.orderId],
      ["side", params.side],
      ["currency", params.currency],
      ["amount", String(params.amountVilcoin)],
      ["price", String(params.pricePerVilcoin)],
      ["g", params.geohash],
    ],
    content: "",
  };

  return finalizeEvent(template, secretKey);
}

/**
 * Retracts a previously posted quote. Since `CASHIER_ORDER_KIND` is already
 * parameterized-replaceable (NIP-01), republishing the same `d` tag with a
 * `cancelled` marker is enough for relays to supersede the old quote — no
 * separate NIP-09 deletion kind needed. `parseCashierOrderEvent` would
 * reject this shape (no valid amount/price), so callers must check
 * `isCashierOrderCancellation()` before parsing.
 */
export function buildCashierOrderCancellationEvent(orderId: string, secretKey: Uint8Array): NostrEvent {
  const template: EventTemplate = {
    kind: CASHIER_ORDER_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", orderId],
      ["cancelled", "true"],
    ],
    content: "",
  };

  return finalizeEvent(template, secretKey);
}

export function isCashierOrderCancellation(event: NostrEvent): boolean {
  return event.kind === CASHIER_ORDER_KIND && event.tags.some((t) => t[0] === "cancelled" && t[1] === "true");
}

export function parseCashierOrderEvent(event: NostrEvent): CashierOrderParams {
  if (event.kind !== CASHIER_ORDER_KIND) {
    throw new Error(`Expected kind ${CASHIER_ORDER_KIND}, got ${event.kind}`);
  }

  const getTag = (name: string): string | undefined => event.tags.find((t) => t[0] === name)?.[1];

  const orderId = getTag("d");
  const side = getTag("side");
  const currency = getTag("currency");
  const amount = getTag("amount");
  const price = getTag("price");
  const geohash = getTag("g");

  if (!orderId || !side || !currency || amount === undefined || price === undefined || !geohash) {
    throw new Error("Cashier order event is missing required tags");
  }
  if (side !== "buy" && side !== "sell") {
    throw new Error(`Invalid cashier order side: ${side}`);
  }

  const amountVilcoin = Number(amount);
  const pricePerVilcoin = Number(price);
  if (!Number.isFinite(amountVilcoin) || amountVilcoin <= 0) {
    throw new Error(`Invalid cashier order amount: ${amount}`);
  }
  if (!Number.isFinite(pricePerVilcoin) || pricePerVilcoin <= 0) {
    throw new Error(`Invalid cashier order price: ${price}`);
  }

  return {
    orderId,
    side,
    currency: currency as CashierCurrency,
    amountVilcoin,
    pricePerVilcoin,
    geohash,
  };
}

const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encodes a lat/lon pair as a geohash. Defaults to precision 5 (~4.9km x
 * 4.9km cells) — coarse enough to signal a general area without revealing
 * an exact meeting point (PRD 6.1).
 */
export function encodeGeohash(latitude: number, longitude: number, precision = 5): string {
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let hash = "";
  let bit = 0;
  let bitCount = 0;
  let evenBit = true;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (longitude >= mid) {
        bit = (bit << 1) | 1;
        lonRange = [mid, lonRange[1]];
      } else {
        bit = bit << 1;
        lonRange = [lonRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (latitude >= mid) {
        bit = (bit << 1) | 1;
        latRange = [mid, latRange[1]];
      } else {
        bit = bit << 1;
        latRange = [latRange[0], mid];
      }
    }
    evenBit = !evenBit;

    if (++bitCount === 5) {
      hash += GEOHASH_BASE32[bit];
      bitCount = 0;
      bit = 0;
    }
  }

  return hash;
}
