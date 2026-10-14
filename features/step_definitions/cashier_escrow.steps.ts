import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { CashierEscrow } from "@villmond/contracts";
import { AccountUpdate, Bool, Field, Mina, PrivateKey, PublicKey, Signature, UInt32, UInt64 } from "o1js";
import type { VillmondWorld } from "../support/world.js";

const RELEASE_SELECTOR = Field(1);
const ARBITER_SELECTOR = Field(2);

/** Matches the [..., address.x, address.isOdd] suffix release()/arbiterResolve() sign over. */
function addressFields(address: PublicKey) {
  return [address.x, address.isOdd.toField()];
}

async function lock(world: VillmondWorld, amount: number, deadlineSlot: number) {
  const tx = await Mina.transaction(world.deployerKey!.toPublicKey(), async () => {
    await world.cashierZkApp!.lockEscrow(
      world.cashierKey!.toPublicKey(),
      world.userKey!.toPublicKey(),
      world.arbiterKey!.toPublicKey(),
      UInt64.from(amount),
      UInt32.from(deadlineSlot),
    );
  });
  await tx.prove();
  await tx.sign([world.deployerKey!]).send();
}

async function tryMethod(world: VillmondWorld, run: () => Promise<void>) {
  world.cashierError = undefined;
  try {
    await run();
  } catch (error) {
    world.cashierError = error as Error;
  }
}

Given("a deployed cashier escrow contract between a cashier, a user, and an arbiter", async function (this: VillmondWorld) {
  const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
  Mina.setActiveInstance(Local);

  this.deployerKey = Local.testAccounts[0].key;
  this.cashierKey = PrivateKey.random();
  this.userKey = PrivateKey.random();
  this.arbiterKey = PrivateKey.random();

  const zkAppKey = PrivateKey.random();
  this.cashierZkApp = new CashierEscrow(zkAppKey.toPublicKey());

  const deployTx = await Mina.transaction(this.deployerKey.toPublicKey(), async () => {
    AccountUpdate.fundNewAccount(this.deployerKey!.toPublicKey());
    await this.cashierZkApp!.deploy();
  });
  await deployTx.prove();
  await deployTx.sign([this.deployerKey, zkAppKey]).send();
});

When(
  "the cashier locks a bond of {int} VILCOIN with deadline slot {int}",
  async function (this: VillmondWorld, amount: number, deadlineSlot: number) {
    await tryMethod(this, () => lock(this, amount, deadlineSlot));
  },
);

Given(
  "the cashier has locked a bond of {int} VILCOIN with deadline slot {int}",
  async function (this: VillmondWorld, amount: number, deadlineSlot: number) {
    await lock(this, amount, deadlineSlot);
  },
);

Then("the escrow holds {int} VILCOIN", function (this: VillmondWorld, amount: number) {
  assert.equal(this.cashierZkApp!.escrowAmount.get().toBigInt(), BigInt(amount));
});

Then("locking a second bond while active is rejected", async function (this: VillmondWorld) {
  await tryMethod(this, () => lock(this, 1, 1));
  assert.ok(this.cashierError, "expected a second lock to be rejected");
});

When("the cashier releases the bond", async function (this: VillmondWorld) {
  const amount = this.cashierZkApp!.escrowAmount.get();
  const signature = Signature.create(this.cashierKey!, [RELEASE_SELECTOR, amount.value, ...addressFields(this.cashierZkApp!.address)]);

  await tryMethod(this, async () => {
    const tx = await Mina.transaction(this.deployerKey!.toPublicKey(), async () => {
      await this.cashierZkApp!.release(signature);
    });
    await tx.prove();
    await tx.sign([this.deployerKey!]).send();
  });
});

When("an impostor tries to release the bond", async function (this: VillmondWorld) {
  const amount = this.cashierZkApp!.escrowAmount.get();
  const impostor = PrivateKey.random();
  const badSignature = Signature.create(impostor, [RELEASE_SELECTOR, amount.value, ...addressFields(this.cashierZkApp!.address)]);

  await tryMethod(this, async () => {
    const tx = await Mina.transaction(this.deployerKey!.toPublicKey(), async () => {
      await this.cashierZkApp!.release(badSignature);
    });
    await tx.prove();
    await tx.sign([this.deployerKey!]).send();
  });
});

When("anyone tries to slash the bond on timeout", async function (this: VillmondWorld) {
  await tryMethod(this, async () => {
    const tx = await Mina.transaction(this.deployerKey!.toPublicKey(), async () => {
      await this.cashierZkApp!.timeoutSlash();
    });
    await tx.prove();
    await tx.sign([this.deployerKey!]).send();
  });
});

When("the arbiter resolves the dispute in favor of the user", async function (this: VillmondWorld) {
  const amount = this.cashierZkApp!.escrowAmount.get();
  const signature = Signature.create(this.arbiterKey!, [
    ARBITER_SELECTOR,
    Field(1),
    amount.value,
    ...addressFields(this.cashierZkApp!.address),
  ]);

  await tryMethod(this, async () => {
    const tx = await Mina.transaction(this.deployerKey!.toPublicKey(), async () => {
      await this.cashierZkApp!.arbiterResolve(signature, Bool(true));
    });
    await tx.prove();
    await tx.sign([this.deployerKey!]).send();
  });
});

When("an impostor tries to resolve the dispute in favor of the user", async function (this: VillmondWorld) {
  const amount = this.cashierZkApp!.escrowAmount.get();
  const impostor = PrivateKey.random();
  const badSignature = Signature.create(impostor, [
    ARBITER_SELECTOR,
    Field(1),
    amount.value,
    ...addressFields(this.cashierZkApp!.address),
  ]);

  await tryMethod(this, async () => {
    const tx = await Mina.transaction(this.deployerKey!.toPublicKey(), async () => {
      await this.cashierZkApp!.arbiterResolve(badSignature, Bool(true));
    });
    await tx.prove();
    await tx.sign([this.deployerKey!]).send();
  });
});

Then("the escrow is settled", function (this: VillmondWorld) {
  assert.equal(this.cashierError, undefined, this.cashierError?.message);
  assert.equal(this.cashierZkApp!.escrowAmount.get().toBigInt(), 0n);
});

Then("the user receives {int} VILCOIN", async function (this: VillmondWorld, amount: number) {
  const events = await this.cashierZkApp!.fetchEvents();
  const settled = events.filter((e) => e.type === "settled").at(-1);
  assert.ok(settled, "expected a settled event to have been emitted");

  const data = settled.event.data as unknown as { recipient: { toBase58(): string }; amount: { toBigInt(): bigint } };
  assert.equal(data.recipient.toBase58(), this.userKey!.toPublicKey().toBase58());
  assert.equal(data.amount.toBigInt(), BigInt(amount));
});

Then("the release attempt is rejected", function (this: VillmondWorld) {
  assert.ok(this.cashierError, "expected the release transaction to fail");
});

Then("the slash attempt is rejected", function (this: VillmondWorld) {
  assert.ok(this.cashierError, "expected the timeout slash transaction to fail");
});

Then("the dispute resolution attempt is rejected", function (this: VillmondWorld) {
  assert.ok(this.cashierError, "expected the arbiter resolution transaction to fail");
});
