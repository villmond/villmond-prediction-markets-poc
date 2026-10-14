import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { generateKeypair, importFromNsec, loadConfig } from "@villmond/nostr";
import type { VillmondWorld } from "../support/world.js";

When("a new visitor's client generates an identity", function (this: VillmondWorld) {
  this.originalIdentity = generateKeypair();
});

Then('the visitor receives a valid "nsec" private key', function (this: VillmondWorld) {
  assert.match(this.originalIdentity!.nsec, /^nsec1/);
});

Then('the visitor receives a valid "npub" public key', function (this: VillmondWorld) {
  assert.match(this.originalIdentity!.npub, /^npub1/);
});

Given("a visitor has previously generated an identity", function (this: VillmondWorld) {
  this.originalIdentity = generateKeypair();
});

When('the visitor imports their backed-up "nsec" on a new device', function (this: VillmondWorld) {
  this.recoveredIdentity = importFromNsec(this.originalIdentity!.nsec);
});

Then("the recovered identity's public key matches the original", function (this: VillmondWorld) {
  assert.equal(this.recoveredIdentity!.npub, this.originalIdentity!.npub);
});

When("the client loads the root configuration", function (this: VillmondWorld) {
  this.config = loadConfig(resolve(import.meta.dirname, "../../config.yaml"));
});

Then("new users start with the configured initial VILCOIN balance", function (this: VillmondWorld) {
  assert.equal(this.config!.economy.initial_user_balance, 1000);
});

Then('the configured token is named "VILCOIN"', function (this: VillmondWorld) {
  assert.equal(this.config!.economy.token_name, "VILCOIN");
});
