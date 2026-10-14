import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { AccountUpdate, Mina, PrivateKey, PublicKey, Signature, UInt64 } from "o1js";
import { MarketSettlement } from "../src/MarketSettlement.js";

/** Matches the [..., address.x, address.isOdd] suffix resolveMarket signs over. */
function addressFields(address: PublicKey) {
  return [address.x, address.isOdd.toField()];
}

describe("MarketSettlement", () => {
  let deployerKey: PrivateKey;
  let adminKey: PrivateKey;
  let oracleKey: PrivateKey;
  let zkApp: MarketSettlement;

  before(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    deployerKey = Local.testAccounts[0].key;
    adminKey = PrivateKey.random();
    oracleKey = PrivateKey.random();
    const zkAppKey = PrivateKey.random();
    zkApp = new MarketSettlement(zkAppKey.toPublicKey());

    const deployTx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      AccountUpdate.fundNewAccount(deployerKey.toPublicKey());
      await zkApp.deploy();
    });
    await deployTx.prove();
    await deployTx.sign([deployerKey, zkAppKey]).send();

    const configureTx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.configure(adminKey.toPublicKey(), oracleKey.toPublicKey());
    });
    await configureTx.prove();
    await configureTx.sign([deployerKey]).send();
  });

  it("resolves a market given a valid oracle signature and proves the admin fee cut", async () => {
    const winningOutcome = UInt64.from(0).value;
    const totalPool = UInt64.from(10_000);
    const signature = Signature.create(oracleKey, [winningOutcome, totalPool.value, ...addressFields(zkApp.address)]);

    const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
      await zkApp.resolveMarket(signature, winningOutcome, totalPool);
    });
    await tx.prove();
    await tx.sign([deployerKey]).send();

    assert.equal(zkApp.resolved.get().toBoolean(), true);
    assert.equal(zkApp.totalPool.get().toBigInt(), 10_000n);
    // 2.5% of 10,000 = 250 (PRD economy.admin_fee_percentage, hardcoded in-contract).
  });

  it("rejects resolution signed by a non-designated key", async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    const freshDeployerKey = Local.testAccounts[0].key;
    const freshZkAppKey = PrivateKey.random();
    const freshZkApp = new MarketSettlement(freshZkAppKey.toPublicKey());

    const deployTx = await Mina.transaction(freshDeployerKey.toPublicKey(), async () => {
      AccountUpdate.fundNewAccount(freshDeployerKey.toPublicKey());
      await freshZkApp.deploy();
    });
    await deployTx.prove();
    await deployTx.sign([freshDeployerKey, freshZkAppKey]).send();

    const configureTx = await Mina.transaction(freshDeployerKey.toPublicKey(), async () => {
      await freshZkApp.configure(adminKey.toPublicKey(), oracleKey.toPublicKey());
    });
    await configureTx.prove();
    await configureTx.sign([freshDeployerKey]).send();

    const impostorKey = PrivateKey.random();
    const winningOutcome = UInt64.from(1).value;
    const totalPool = UInt64.from(5_000);
    const badSignature = Signature.create(impostorKey, [winningOutcome, totalPool.value, ...addressFields(freshZkApp.address)]);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(freshDeployerKey.toPublicKey(), async () => {
        await freshZkApp.resolveMarket(badSignature, winningOutcome, totalPool);
      });
      await tx.prove();
      await tx.sign([freshDeployerKey]).send();
    });
  });

  it("rejects a valid oracle signature produced for a different market contract (replay protection)", async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    const freshDeployerKey = Local.testAccounts[0].key;
    const otherZkAppKey = PrivateKey.random();
    const otherZkApp = new MarketSettlement(otherZkAppKey.toPublicKey());

    const deployTx = await Mina.transaction(freshDeployerKey.toPublicKey(), async () => {
      AccountUpdate.fundNewAccount(freshDeployerKey.toPublicKey());
      await otherZkApp.deploy();
    });
    await deployTx.prove();
    await deployTx.sign([freshDeployerKey, otherZkAppKey]).send();

    const configureTx = await Mina.transaction(freshDeployerKey.toPublicKey(), async () => {
      await otherZkApp.configure(adminKey.toPublicKey(), oracleKey.toPublicKey());
    });
    await configureTx.prove();
    await configureTx.sign([freshDeployerKey]).send();

    const winningOutcome = UInt64.from(0).value;
    const totalPool = UInt64.from(10_000);
    // Same oracle, same outcome/pool as the first test — but signed for `zkApp`'s address, not `otherZkApp`'s.
    const signatureForAnotherMarket = Signature.create(oracleKey, [winningOutcome, totalPool.value, ...addressFields(zkApp.address)]);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(freshDeployerKey.toPublicKey(), async () => {
        await otherZkApp.resolveMarket(signatureForAnotherMarket, winningOutcome, totalPool);
      });
      await tx.prove();
      await tx.sign([freshDeployerKey]).send();
    });
  });

  it("rejects a second resolution attempt", async () => {
    const winningOutcome = UInt64.from(1).value;
    const totalPool = UInt64.from(1);
    const signature = Signature.create(oracleKey, [winningOutcome, totalPool.value, ...addressFields(zkApp.address)]);

    await assert.rejects(async () => {
      const tx = await Mina.transaction(deployerKey.toPublicKey(), async () => {
        await zkApp.resolveMarket(signature, winningOutcome, totalPool);
      });
      await tx.prove();
      await tx.sign([deployerKey]).send();
    });
  });
});
