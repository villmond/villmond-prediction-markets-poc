import { AccountUpdate, Bool, Field, Mina, PrivateKey, PublicKey, Signature, UInt32, UInt64, fetchAccount } from "o1js";
import { CashierEscrow, MarketSettlement, RELEASE_SELECTOR, ARBITER_SELECTOR, VilcoinLedger } from "@villmond/contracts";
import { ensureDevnetConnection } from "./minaNetwork.js";

const TRANSACTION_FEE = 100_000_000; // 0.1 MINA, matches o1js's own Devnet examples and deploy-devnet.ts

/**
 * Real on-chain zkApp calls, built and sent directly from the browser — no
 * server in between. Every function here compiles its contract lazily (once
 * per page session; o1js caches the result on the class itself after the
 * first call) and returns the sent transaction's hash.
 *
 * These are genuinely slow on first use (compiling a zkApp's proving keys
 * client-side can take tens of seconds), and `prove()`/`send()` both need a
 * real Devnet-funded fee payer — see DEPLOYMENT.md §1 and the Mina wallet's
 * faucet button in Expert Mode.
 */

let ledgerCompiled = false;
let settlementCompiled = false;
let escrowCompiled = false;

async function compileLedger() {
  if (!ledgerCompiled) {
    await VilcoinLedger.compile();
    ledgerCompiled = true;
  }
}

async function compileSettlement() {
  if (!settlementCompiled) {
    await MarketSettlement.compile();
    settlementCompiled = true;
  }
}

async function compileEscrow() {
  if (!escrowCompiled) {
    await CashierEscrow.compile();
    escrowCompiled = true;
  }
}

export interface DeployedMarketContracts {
  ledgerAddress: string;
  settlementAddress: string;
}

/** Deploys a fresh VilcoinLedger (seeded) + MarketSettlement (configured) pair for one new market. */
export async function deployMarketContracts(
  deployerKey: PrivateKey,
  initialLiquidity: number,
  adminPublicKey: PublicKey,
  oraclePublicKey: PublicKey,
): Promise<DeployedMarketContracts> {
  ensureDevnetConnection();
  const deployerAddress = deployerKey.toPublicKey();

  await Promise.all([compileLedger(), compileSettlement()]);

  const ledgerKey = PrivateKey.random();
  const ledger = new VilcoinLedger(ledgerKey.toPublicKey());
  const settlementKey = PrivateKey.random();
  const settlement = new MarketSettlement(settlementKey.toPublicKey());

  const deployTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    AccountUpdate.fundNewAccount(deployerAddress, 2);
    await ledger.deploy();
    await settlement.deploy();
  });
  await deployTx.prove();
  await deployTx.sign([deployerKey, ledgerKey, settlementKey]).send();

  const seedTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    await ledger.seedLiquidity(UInt64.from(initialLiquidity));
  });
  await seedTx.prove();
  await seedTx.sign([deployerKey]).send();

  const configureTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    await settlement.configure(adminPublicKey, oraclePublicKey);
  });
  await configureTx.prove();
  await configureTx.sign([deployerKey]).send();

  return { ledgerAddress: ledgerKey.toPublicKey().toBase58(), settlementAddress: settlementKey.toPublicKey().toBase58() };
}

/** Buys outcome A (index 0) or B (index >=1) on a deployed VilcoinLedger. */
export async function buyOutcomeOnChain(
  ledgerAddressBase58: string,
  buyerKey: PrivateKey,
  outcomeIndex: number,
  amount: number,
): Promise<string> {
  ensureDevnetConnection();
  await compileLedger();

  const ledger = new VilcoinLedger(PublicKey.fromBase58(ledgerAddressBase58));
  const buyerAddress = buyerKey.toPublicKey();

  const tx = await Mina.transaction({ sender: buyerAddress, fee: TRANSACTION_FEE }, async () => {
    if (outcomeIndex === 0) {
      await ledger.buyOutcomeA(UInt64.from(amount));
    } else {
      await ledger.buyOutcomeB(UInt64.from(amount));
    }
  });
  await tx.prove();
  const pending = await tx.sign([buyerKey]).send();
  return pending.hash;
}

/** Resolves a deployed MarketSettlement; `oracleKey` both signs the resolution and pays the fee. */
export async function resolveMarketOnChain(
  settlementAddressBase58: string,
  oracleKey: PrivateKey,
  winningOutcome: number,
  totalPool: number,
): Promise<string> {
  ensureDevnetConnection();
  await compileSettlement();

  const settlement = new MarketSettlement(PublicKey.fromBase58(settlementAddressBase58));
  const winningOutcomeField = UInt64.from(winningOutcome).value;
  const totalPoolAmount = UInt64.from(totalPool);
  const address = settlement.address;
  const signature = Signature.create(oracleKey, [
    winningOutcomeField,
    totalPoolAmount.value,
    address.x,
    address.isOdd.toField(),
  ]);

  const senderAddress = oracleKey.toPublicKey();
  const tx = await Mina.transaction({ sender: senderAddress, fee: TRANSACTION_FEE }, async () => {
    await settlement.resolveMarket(signature, winningOutcomeField, totalPoolAmount);
  });
  await tx.prove();
  const pending = await tx.sign([oracleKey]).send();
  return pending.hash;
}

/** Deploys and locks a fresh CashierEscrow for one P2P trade. */
export async function lockEscrowOnChain(
  deployerKey: PrivateKey,
  cashierPublicKey: PublicKey,
  userPublicKey: PublicKey,
  arbiterPublicKey: PublicKey,
  amount: number,
  deadlineSlot: number,
): Promise<{ escrowAddress: string; hash: string }> {
  ensureDevnetConnection();
  await compileEscrow();

  const deployerAddress = deployerKey.toPublicKey();
  const escrowKey = PrivateKey.random();
  const escrow = new CashierEscrow(escrowKey.toPublicKey());

  const deployTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    AccountUpdate.fundNewAccount(deployerAddress);
    await escrow.deploy();
  });
  await deployTx.prove();
  await deployTx.sign([deployerKey, escrowKey]).send();

  const lockTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    await escrow.lockEscrow(
      cashierPublicKey,
      userPublicKey,
      arbiterPublicKey,
      UInt64.from(amount),
      UInt32.from(deadlineSlot),
    );
  });
  await lockTx.prove();
  const pending = await lockTx.sign([deployerKey]).send();

  return { escrowAddress: escrowKey.toPublicKey().toBase58(), hash: pending.hash };
}

/** Cashier releases a locked escrow to the user. */
export async function releaseEscrowOnChain(escrowAddressBase58: string, cashierKey: PrivateKey): Promise<string> {
  ensureDevnetConnection();
  await compileEscrow();

  const escrow = new CashierEscrow(PublicKey.fromBase58(escrowAddressBase58));
  const { account } = await fetchAccount({ publicKey: escrow.address });
  const amount: Field = account?.zkapp?.appState[6] ?? UInt64.zero.value;
  const signature = Signature.create(cashierKey, [
    RELEASE_SELECTOR,
    amount,
    escrow.address.x,
    escrow.address.isOdd.toField(),
  ]);

  const senderAddress = cashierKey.toPublicKey();
  const tx = await Mina.transaction({ sender: senderAddress, fee: TRANSACTION_FEE }, async () => {
    await escrow.release(signature);
  });
  await tx.prove();
  const pending = await tx.sign([cashierKey]).send();
  return pending.hash;
}

/** Anyone may trigger this once the escrow's deadline slot has passed. */
export async function timeoutSlashEscrowOnChain(escrowAddressBase58: string, senderKey: PrivateKey): Promise<string> {
  ensureDevnetConnection();
  await compileEscrow();

  const escrow = new CashierEscrow(PublicKey.fromBase58(escrowAddressBase58));
  const senderAddress = senderKey.toPublicKey();
  const tx = await Mina.transaction({ sender: senderAddress, fee: TRANSACTION_FEE }, async () => {
    await escrow.timeoutSlash();
  });
  await tx.prove();
  const pending = await tx.sign([senderKey]).send();
  return pending.hash;
}

/** Designated arbiter breaks a dispute in favor of the user (true) or the cashier (false). */
export async function arbiterResolveEscrowOnChain(
  escrowAddressBase58: string,
  arbiterKey: PrivateKey,
  favorUser: boolean,
): Promise<string> {
  ensureDevnetConnection();
  await compileEscrow();

  const escrow = new CashierEscrow(PublicKey.fromBase58(escrowAddressBase58));
  const { account } = await fetchAccount({ publicKey: escrow.address });
  const amount: Field = account?.zkapp?.appState[6] ?? UInt64.zero.value;
  const favorUserBool = Bool(favorUser);
  const signature = Signature.create(arbiterKey, [
    ARBITER_SELECTOR,
    favorUserBool.toField(),
    amount,
    escrow.address.x,
    escrow.address.isOdd.toField(),
  ]);

  const senderAddress = arbiterKey.toPublicKey();
  const tx = await Mina.transaction({ sender: senderAddress, fee: TRANSACTION_FEE }, async () => {
    await escrow.arbiterResolve(signature, favorUserBool);
  });
  await tx.prove();
  const pending = await tx.sign([arbiterKey]).send();
  return pending.hash;
}
