import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { computePayoutShares } from "@villmond/nostr/payout.js";
import type { VillmondWorld } from "../support/world.js";

function addBet(world: VillmondWorld, amount: number, outcomeIndex: number, pubkey: string) {
  world.bets.push({ pubkey, outcomeIndex, amount });
}

Given("a bet of {int} VILCOIN on outcome {int} from {string}", function (this: VillmondWorld, amount: number, outcomeIndex: number, pubkey: string) {
  addBet(this, amount, outcomeIndex, pubkey);
});

Given("another bet of {int} VILCOIN on outcome {int} from {string}", function (this: VillmondWorld, amount: number, outcomeIndex: number, pubkey: string) {
  addBet(this, amount, outcomeIndex, pubkey);
});

When(
  "the market resolves with winning outcome {int} and a total pool of {int} VILCOIN",
  function (this: VillmondWorld, winningOutcome: number, totalPool: number) {
    this.payoutRecipients = computePayoutShares(this.bets, winningOutcome, totalPool);
  },
);

Then("{string} receives a payout of {int} VILCOIN", function (this: VillmondWorld, pubkey: string, expected: number) {
  const recipient = this.payoutRecipients!.find((r) => r.pubkey === pubkey);
  assert.ok(recipient, `expected a payout for ${pubkey}`);
  assert.equal(recipient.amount, expected);
});

Then("{string} receives no payout", function (this: VillmondWorld, pubkey: string) {
  const recipient = this.payoutRecipients!.find((r) => r.pubkey === pubkey);
  assert.equal(recipient, undefined);
});

Then("no payout is computed", function (this: VillmondWorld) {
  assert.equal(this.payoutRecipients!.length, 0);
});
