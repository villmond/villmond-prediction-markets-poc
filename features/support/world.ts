import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { OracleRating, OracleReputation, VillmondConfig, VillmondKeypair } from "@villmond/nostr";
import type { PayoutRecipient } from "@villmond/nostr/payout.js";
import type { CashierEscrow, MarketSettlement } from "@villmond/contracts";
import type { PrivateKey } from "o1js";

export class VillmondWorld extends World {
  // onboarding.feature
  originalIdentity?: VillmondKeypair;
  recoveredIdentity?: VillmondKeypair;
  config?: VillmondConfig;

  // market_settlement.feature
  zkApp?: MarketSettlement;
  deployerKey?: PrivateKey;
  adminKey?: PrivateKey;
  oracleKey?: PrivateKey;
  resolutionError?: Error;

  // oracle_ranking.feature
  ratings: OracleRating[] = [];
  reputation?: OracleReputation;

  // cashier_escrow.feature
  cashierZkApp?: CashierEscrow;
  cashierKey?: PrivateKey;
  userKey?: PrivateKey;
  arbiterKey?: PrivateKey;
  cashierError?: Error;

  // market_payout.feature
  bets: { pubkey: string; outcomeIndex: number; amount: number }[] = [];
  payoutRecipients?: PayoutRecipient[];
}

setWorldConstructor(VillmondWorld);
