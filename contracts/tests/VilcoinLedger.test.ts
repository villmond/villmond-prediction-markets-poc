import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { AccountUpdate, Mina, PrivateKey, UInt64 } from "o1js";
import { VilcoinLedger } from "../src/VilcoinLedger.js";

describe("VilcoinLedger", () => {
  let deployerKey: PrivateKey;
  let zkApp: VilcoinLedger;

  before(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    deployerKey = Local.testAccounts[0].key;
    const zkAppKey = PrivateKey.random();
    zkApp = new VilcoinLedger(zkAppKey.toPublicKey());

    const deployTx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      AccountUpdate.fundNewAccount(deployerKey.toPublicKey());
      await zkApp.deploy();
    });
    await deployTx.prove();
    await deployTx.sign([deployerKey, zkAppKey]).send();
  });

  it("seeds liquidity exactly once", async () => {
    const seedTx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.seedLiquidity(UInt64.from(1000));
    });
    await seedTx.prove();
    await seedTx.sign([deployerKey]).send();

    assert.equal(zkApp.outcomeAPool.get().toBigInt(), 1000n);
    assert.equal(zkApp.outcomeBPool.get().toBigInt(), 1000n);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.seedLiquidity(UInt64.from(500));
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });

  it("buying outcome A moves the constant-product curve correctly", async () => {
    const poolABefore = zkApp.outcomeAPool.get().toBigInt();
    const poolBBefore = zkApp.outcomeBPool.get().toBigInt();
    const k = poolABefore * poolBBefore;

    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.buyOutcomeA(UInt64.from(100));
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();

    const poolAAfter = zkApp.outcomeAPool.get().toBigInt();
    const poolBAfter = zkApp.outcomeBPool.get().toBigInt();

    assert.equal(poolBAfter, poolBBefore + 100n);
    assert.equal(poolAAfter, k / poolBAfter);
    assert.equal(zkApp.totalVolume.get().toBigInt(), 100n);
  });

  it("rejects a zero-amount trade", async () => {
    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.buyOutcomeB(UInt64.from(0));
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });
});
