/**
 * Deploys MarketSettlement to Mina Devnet and configures it with an
 * admin/oracle key pair.
 *
 * This is a reference deployment script, not something this repository runs
 * for you — it needs a deployer account funded with real (testnet) MINA,
 * which only you can provide. The same `Mina.Network` + compile + deploy
 * pattern applies to VilcoinLedger and CashierEscrow; swap the import and
 * the post-deploy configure/lock call.
 *
 * Usage:
 *   cd contracts
 *   npm run build
 *   DEVNET_DEPLOYER_KEY=EKE... node build/scripts/deploy-devnet.js
 *
 * Env vars:
 *   DEVNET_DEPLOYER_KEY       base58 PrivateKey of the fee-payer account.
 *                             Omit to generate + faucet-fund a fresh one
 *                             (printed to stdout — save it, the faucet
 *                             allows one funding per address).
 *   MARKET_ADMIN_PUBLIC_KEY   base58 PublicKey for economy.admin_public_key.
 *                             Defaults to the deployer's own key.
 *   MARKET_ORACLE_PUBLIC_KEY  base58 PublicKey for the designated oracle.
 *                             Defaults to the deployer's own key — replace
 *                             this with a real, separate oracle key before
 *                             trusting any resolution.
 */
import { AccountUpdate, Mina, PrivateKey, PublicKey, fetchAccount } from "o1js";
import { MarketSettlement } from "../src/MarketSettlement.js";

const DEVNET_GRAPHQL = "https://api.minascan.io/node/devnet/v1/graphql";
const DEVNET_ARCHIVE = "https://api.minascan.io/archive/devnet/v1/graphql";
const TRANSACTION_FEE = 100_000_000; // 0.1 MINA, matches o1js's own Devnet examples

Mina.setActiveInstance(Mina.Network({ mina: DEVNET_GRAPHQL, archive: DEVNET_ARCHIVE }));

async function resolveDeployerKey(): Promise<PrivateKey> {
  const fromEnv = process.env.DEVNET_DEPLOYER_KEY;
  if (fromEnv) return PrivateKey.fromBase58(fromEnv);

  const fresh = PrivateKey.random();
  console.log(`No DEVNET_DEPLOYER_KEY set — generated a new deployer: ${fresh.toPublicKey().toBase58()}`);
  console.log(`Save this private key to reuse it (the faucet funds each address once): ${fresh.toBase58()}`);
  console.log("Requesting Devnet faucet funds...");
  await Mina.faucet(fresh.toPublicKey());
  return fresh;
}

async function main() {
  const deployerKey = await resolveDeployerKey();
  const deployerAddress = deployerKey.toPublicKey();

  console.log(`Fetching deployer account ${deployerAddress.toBase58()}...`);
  const { account } = await fetchAccount({ publicKey: deployerAddress });
  console.log(`Deployer balance: ${account?.balance.toString() ?? "unknown"}`);

  const adminPublicKey = process.env.MARKET_ADMIN_PUBLIC_KEY
    ? PublicKey.fromBase58(process.env.MARKET_ADMIN_PUBLIC_KEY)
    : deployerAddress;
  const oraclePublicKey = process.env.MARKET_ORACLE_PUBLIC_KEY
    ? PublicKey.fromBase58(process.env.MARKET_ORACLE_PUBLIC_KEY)
    : deployerAddress;

  const zkAppKey = PrivateKey.random();
  const zkAppAddress = zkAppKey.toPublicKey();
  const zkApp = new MarketSettlement(zkAppAddress);

  console.log("Compiling MarketSettlement (first run downloads/builds proving keys, can take minutes)...");
  await MarketSettlement.compile();

  console.log(`Deploying zkApp at ${zkAppAddress.toBase58()}...`);
  const deployTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    AccountUpdate.fundNewAccount(deployerAddress);
    await zkApp.deploy();
  });
  await deployTx.prove();
  const deploySent = await deployTx.sign([deployerKey, zkAppKey]).send();
  console.log(`Deploy transaction sent: ${deploySent.hash}`);
  await deploySent.wait({ maxAttempts: 90 });
  console.log("Deploy included.");

  console.log("Configuring admin/oracle keys...");
  const configureTx = await Mina.transaction({ sender: deployerAddress, fee: TRANSACTION_FEE }, async () => {
    await zkApp.configure(adminPublicKey, oraclePublicKey);
  });
  await configureTx.prove();
  const configureSent = await configureTx.sign([deployerKey]).send();
  console.log(`Configure transaction sent: ${configureSent.hash}`);
  await configureSent.wait({ maxAttempts: 90 });
  console.log("Configure included.");

  console.log("");
  console.log("Deployed MarketSettlement:");
  console.log(`  address:      ${zkAppAddress.toBase58()}`);
  console.log(`  admin key:    ${adminPublicKey.toBase58()}`);
  console.log(`  oracle key:   ${oraclePublicKey.toBase58()}`);
  console.log(`  explorer:     https://minascan.io/devnet/account/${zkAppAddress.toBase58()}`);
  console.log("");
  console.log("Save the zkApp address — the client has no config.yaml field for it yet (see DEPLOYMENT.md).");
}

main().catch((error: unknown) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
