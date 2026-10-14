import { Mina } from "o1js";

/** Same public Devnet endpoints `contracts/scripts/deploy-devnet.ts` uses — see DEPLOYMENT.md §1. */
const DEVNET_GRAPHQL = "https://api.minascan.io/node/devnet/v1/graphql";
const DEVNET_ARCHIVE = "https://api.minascan.io/archive/devnet/v1/graphql";

let connected = false;

/** Idempotent: sets Mina's active instance to Devnet once per page session. */
export function ensureDevnetConnection(): void {
  if (connected) return;
  Mina.setActiveInstance(Mina.Network({ mina: DEVNET_GRAPHQL, archive: DEVNET_ARCHIVE }));
  connected = true;
}
