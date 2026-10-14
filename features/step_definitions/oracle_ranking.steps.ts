import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { computeOracleReputation, loadConfig, type OracleRating } from "@villmond/nostr";
import { resolve } from "node:path";
import type { VillmondWorld } from "../support/world.js";

const ORACLE_PUBLIC_KEY = "oracle-under-test";
let nextTimestamp = 1_700_000_000;

function addRating(world: VillmondWorld, raterPublicKey: string, score: number): OracleRating {
  const rating: OracleRating = {
    raterPublicKey,
    oraclePublicKey: ORACLE_PUBLIC_KEY,
    score,
    review: "",
    createdAt: nextTimestamp++,
  };
  world.ratings.push(rating);
  return rating;
}

Given("an oracle has received a score of {int} from {string}", function (this: VillmondWorld, score: number, rater: string) {
  addRating(this, rater, score);
});

Given("the same oracle has received a score of {int} from {string}", function (this: VillmondWorld, score: number, rater: string) {
  addRating(this, rater, score);
});

Given("the same oracle later receives a score of {int} from {string}", function (this: VillmondWorld, score: number, rater: string) {
  addRating(this, rater, score);
});

Given("an oracle has received no ratings", function (this: VillmondWorld) {
  this.ratings = [];
});

When("the oracle's reputation is computed", function (this: VillmondWorld) {
  this.reputation = computeOracleReputation(this.ratings, ORACLE_PUBLIC_KEY);
});

Then("the average score is {int}", function (this: VillmondWorld, expected: number) {
  assert.equal(this.reputation!.averageScore, expected);
});

Then("the rating count is {int}", function (this: VillmondWorld, expected: number) {
  assert.equal(this.reputation!.ratingCount, expected);
});

Then("the oracle meets the configured minimum reputation threshold", function (this: VillmondWorld) {
  const config = loadConfig(resolve(import.meta.dirname, "../../config.yaml"));
  assert.ok(this.reputation!.meetsThreshold(config.oracles.min_reputation_threshold));
});

Then("the oracle does not meet the configured minimum reputation threshold", function (this: VillmondWorld) {
  const config = loadConfig(resolve(import.meta.dirname, "../../config.yaml"));
  assert.ok(!this.reputation!.meetsThreshold(config.oracles.min_reputation_threshold));
});
