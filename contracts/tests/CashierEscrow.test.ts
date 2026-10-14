import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { AccountUpdate, Bool, Field, Mina, PrivateKey, PublicKey, Signature, UInt32, UInt64 } from "o1js";
import { CashierEscrow } from "../src/CashierEscrow.js";

const RELEASE_SELECTOR = Field(1);
const ARBITER_SELECTOR = Field(2);

/** Matches the [..., address.x, address.isOdd] suffix release()/arbiterResolve() sign over. */
function addressFields(address: PublicKey) {
  return [address.x, address.isOdd.toField()];
}

describe("CashierEscrow", () => {
  let deployerKey: PrivateKey;
  let cashierKey: PrivateKey;
  let userKey: PrivateKey;
  let arbiterKey: PrivateKey;
  let zkApp: CashierEscrow;

  async function deployFreshEscrow() {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    deployerKey = Local.testAccounts[0].key;

    const zkAppKey = PrivateKey.random();
    zkApp = new CashierEscrow(zkAppKey.toPublicKey());

    const deployTx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      AccountUpdate.fundNewAccount(deployerKey.toPublicKey());
      await zkApp.deploy();
    });
    await deployTx.prove();
    await deployTx.sign([deployerKey, zkAppKey]).send();
  }

  async function lock(amount: number, deadlineSlot: number) {
    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.lockEscrow(
        cashierKey.toPublicKey(),
        userKey.toPublicKey(),
        arbiterKey.toPublicKey(),
        UInt64.from(amount),
        UInt32.from(deadlineSlot),
      );
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();
  }

  before(() => {
    cashierKey = PrivateKey.random();
    userKey = PrivateKey.random();
    arbiterKey = PrivateKey.random();
  });

  beforeEach(async () => {
    await deployFreshEscrow();
  });

  it("locks a bond and rejects a second lock while active", async () => {
    await lock(10_000, 1_000);
    assert.equal(zkApp.escrowAmount.get().toBigInt(), 10_000n);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.lockEscrow(
          cashierKey.toPublicKey(),
          userKey.toPublicKey(),
          arbiterKey.toPublicKey(),
          UInt64.from(1),
          UInt32.from(1_000),
        );
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });

  it("releases the full bond to the user on a valid cashier signature", async () => {
    await lock(10_000, 1_000);

    const signature = Signature.create(cashierKey, [RELEASE_SELECTOR, UInt64.from(10_000).value, ...addressFields(zkApp.address)]);
    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.release(signature);
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();

    assert.equal(zkApp.escrowAmount.get().toBigInt(), 0n);
  });

  it("rejects release signed by an impostor", async () => {
    await lock(10_000, 1_000);

    const impostor = PrivateKey.random();
    const badSignature = Signature.create(impostor, [RELEASE_SELECTOR, UInt64.from(10_000).value, ...addressFields(zkApp.address)]);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.release(badSignature);
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });

  it("rejects a timeout slash before the deadline slot", async () => {
    await lock(10_000, 1_000_000);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.timeoutSlash();
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });

  it("allows a timeout slash once the deadline slot has passed", async () => {
    await lock(10_000, 0);

    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.timeoutSlash();
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();

    assert.equal(zkApp.escrowAmount.get().toBigInt(), 0n);
  });

  it("lets the arbiter resolve a dispute in favor of either party", async () => {
    await lock(10_000, 1_000);

    const signature = Signature.create(arbiterKey, [
      ARBITER_SELECTOR,
      Field(1), // favorUser = true
      UInt64.from(10_000).value,
      ...addressFields(zkApp.address),
    ]);

    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.arbiterResolve(signature, Bool(true));
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();

    assert.equal(zkApp.escrowAmount.get().toBigInt(), 0n);
  });

  it("rejects arbiter resolution signed by a non-designated key", async () => {
    await lock(10_000, 1_000);

    const impostor = PrivateKey.random();
    const badSignature = Signature.create(impostor, [ARBITER_SELECTOR, Field(1), UInt64.from(10_000).value, ...addressFields(zkApp.address)]);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.arbiterResolve(badSignature, Bool(true));
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });

  it("rejects settlement methods once the escrow is already settled", async () => {
    await lock(10_000, 1_000);
    const signature = Signature.create(cashierKey, [RELEASE_SELECTOR, UInt64.from(10_000).value, ...addressFields(zkApp.address)]);
    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.release(signature);
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();

    await assert.rejects(async () => {
      const tx2 = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.timeoutSlash();
      });
      await tx2.prove();
      await tx2.sign([deployerKey]).send();
    });
  });

  it("rejects a valid cashier release signature produced for a different escrow (replay protection)", async () => {
    await lock(10_000, 1_000);
    // Sign a release message for a brand-new, never-deployed address — simulates a
    // signature the cashier produced for a *different* escrow instance sharing the
    // same cashier key and the same locked amount.
    const otherEscrowAddress = PrivateKey.random().toPublicKey();
    const signatureForAnotherEscrow = Signature.create(cashierKey, [
      RELEASE_SELECTOR,
      UInt64.from(10_000).value,
      ...addressFields(otherEscrowAddress),
    ]);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.release(signatureForAnotherEscrow);
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });
});
