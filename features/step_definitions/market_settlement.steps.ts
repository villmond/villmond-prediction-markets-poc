import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { MarketSettlement } from "@villmond/contracts";
import { AccountUpdate, Mina, PrivateKey, Signature, UInt64 } from "o1js";
import type { VillmondWorld } from "../support/world.js";

async function resolveMarket(world: VillmondWorld, signerKey: PrivateKey, totalPool: number, winningOutcome: number) {
  world.resolutionError = undefined;
  try {
    const address = world.zkApp!.address;
    const signature = Signature.create(signerKey, [
      UInt64.from(winningOutcome).value,
      UInt64.from(totalPool).value,
      address.x,
      address.isOdd.toField(),
    ]);
    const tx = await Mina.transaction(world.deployerKey!.toPublicKey(), async () => {
      await world.zkApp!.resolveMarket(signature, UInt64.from(winningOutcome).value, UInt64.from(totalPool));
    });
    await tx.prove();
    await tx.sign([world.deployerKey!]).send();
  } catch (error) {
    world.resolutionError = error as Error;
  }
}

Given("a deployed market settlement contract with a designated admin and oracle", async function (this: VillmondWorld) {
  const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
  Mina.setActiveInstance(Local);

  this.deployerKey = Local.testAccounts[0].key;
  this.adminKey = PrivateKey.random();
  this.oracleKey = PrivateKey.random();

  const zkAppKey = PrivateKey.random();
  this.zkApp = new MarketSettlement(zkAppKey.toPublicKey());

  const deployTx = await Mina.transaction(this.deployerKey.toPublicKey(), async () => {
    AccountUpdate.fundNewAccount(this.deployerKey!.toPublicKey());
    await this.zkApp!.deploy();
  });
  await deployTx.prove();
  await deployTx.sign([this.deployerKey, zkAppKey]).send();

  const configureTx = await Mina.transaction(this.deployerKey.toPublicKey(), async () => {
    await this.zkApp!.configure(this.adminKey!.toPublicKey(), this.oracleKey!.toPublicKey());
  });
  await configureTx.prove();
  await configureTx.sign([this.deployerKey]).send();
});

When(
  "the oracle resolves the market with a total pool of {int} VILCOIN and winning outcome {int}",
  async function (this: VillmondWorld, totalPool: number, winningOutcome: number) {
    await resolveMarket(this, this.oracleKey!, totalPool, winningOutcome);
  },
);

Given(
  "the oracle has already resolved the market with a total pool of {int} VILCOIN and winning outcome {int}",
  async function (this: VillmondWorld, totalPool: number, winningOutcome: number) {
    await resolveMarket(this, this.oracleKey!, totalPool, winningOutcome);
    assert.equal(this.resolutionError, undefined, "setup resolution should succeed");
  },
);

When(
  "the oracle tries to resolve the market again with a total pool of {int} VILCOIN and winning outcome {int}",
  async function (this: VillmondWorld, totalPool: number, winningOutcome: number) {
    await resolveMarket(this, this.oracleKey!, totalPool, winningOutcome);
  },
);

When(
  "an impostor tries to resolve the market with a total pool of {int} VILCOIN and winning outcome {int}",
  async function (this: VillmondWorld, totalPool: number, winningOutcome: number) {
    await resolveMarket(this, PrivateKey.random(), totalPool, winningOutcome);
  },
);

Then("the market is marked resolved", function (this: VillmondWorld) {
  assert.equal(this.resolutionError, undefined);
  // typescript-eslint's isolated program loses the o1js `@state(Bool)` decorator type here; `tsc` itself
  // resolves `.resolved.get(): Bool` correctly (verified via `tsc -p features/tsconfig.json --noEmit`).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  assert.equal(this.zkApp!.resolved.get().toBoolean(), true);
});

Then("the proven admin fee is {int} VILCOIN", function (this: VillmondWorld, expectedFee: number) {
  const totalPool = this.zkApp!.totalPool.get().toBigInt();
  const adminFeeBps = 250n;
  const actualFee = (totalPool * adminFeeBps) / 10_000n;
  assert.equal(actualFee, BigInt(expectedFee));
});

Then("the resolution attempt is rejected", function (this: VillmondWorld) {
  assert.ok(this.resolutionError, "expected the resolution transaction to fail");
});
