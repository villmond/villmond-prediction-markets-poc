# Deployment Guide: Mina Devnet, IPFS, Nostr

How to move each piece of `villmond-prediction-markets-poc` off `localhost`
and onto real test infrastructure, and what to expect once you do. See
[`DEMO.md`](./DEMO.md) for the local walkthrough this builds on, and
[`SECURITY.md`](./SECURITY.md) for why none of this should be called a
"release" yet.

## 0. Read this first: what's actually wired together today

Before pointing test users at anything, know the real integration boundary:

- **Nostr (PWA ↔ relays) is fully wired and live.** Onboarding, market
  browsing, market *creation* (`client/src/components/CreateMarketModal.tsx`,
  the "+ New market" button in Newbie Mode), bet-event publishing, and the
  Cashier quote board all talk to real relays today, with no deployment
  step needed (see §3).
- **Market creation needs a reachable IPFS node to actually work.**
  `CreateMarketModal` pins the question/outcomes via `IpfsClient` before
  signing and publishing the event; if no IPFS node answers at its default
  `http://127.0.0.1:5001`, the form shows a clear error and does not
  publish a broken market. Run a local Kubo node (§2.1) — or the browser's
  `localhost:5001` call will simply fail — before test users try this.
- **The Mina zkApp contracts *are* callable directly from the browser, with
  no server in between.** `o1js` runs client-side (WASM) and the PWA holds
  its own Mina wallet (Expert Mode → "Mina wallet", separate from the Nostr
  identity — see §1.3). Every contract method is reachable from the UI:
  - `CreateMarketModal`'s "Deploy real on-chain contracts (Mina Devnet)"
    checkbox deploys and configures a fresh `VilcoinLedger` + `MarketSettlement`
    pair (`client/src/utils/minaContracts.ts`'s `deployMarketContracts`) and
    embeds both addresses in the published `kind:30000` event as
    `ledger_address`/`settlement_address` tags, so any client can find them.
  - A market card's Yes/No tap also sends a real `VilcoinLedger.buyOutcomeA/B`
    call (`buyOutcomeOnChain`) whenever the market it belongs to has a
    `ledgerAddress` — markets without one (including ones from other,
    Nostr-only clients) keep working exactly as before, Nostr-event-only.
  - Expert Mode's "Resolve a market" panel calls
    `MarketSettlement.resolveMarket` (`resolveMarketOnChain`) for any market
    with a `settlementAddress`, signed by the local Mina wallet acting as
    oracle.
  - Expert Mode's "Cashier escrow (on-chain)" panel calls all four
    `CashierEscrow` methods (`lockEscrowOnChain`/`releaseEscrowOnChain`/
    `timeoutSlashEscrowOnChain`/`arbiterResolveEscrowOnChain`), gated behind
    `economy.enable_cashier_network: true`. There's no address directory for
    cashiers/arbiters (by design — PRD 6/6.1 lets any key act per-trade), so
    counterpart addresses are manual Mina-address entry.
  - Real authorization stays cryptographic, not UI-gated: a resolution only
    succeeds if it's signed by the exact `oraclePublicKey` a market's
    `MarketSettlement` was configured with, same for `CashierEscrow`'s
    cashier/arbiter signatures. The role badges (§6.5 of DEMO.md) are purely
    informational.
- **Known POC simplifications, stated plainly rather than discovered:**
  the market creator's own Mina wallet becomes that market's admin at deploy
  time (there's no directory mapping a Nostr admin key to a Mina address);
  first-use compilation of each contract's proving keys is slow (tens of
  seconds) and happens once per browser tab/session; every signed call needs
  a Devnet-funded Mina wallet (the faucet button in §1.3); and none of this
  has been exercised against a fully live, funded Devnet account in this
  environment — it's verified by typecheck, lint, build, the contract/nostr
  test suites, and live (non-transacting) UI rendering, not a confirmed
  on-chain transaction. Walk a real funded wallet through it before trusting
  it in front of testers.

So "expose it to test users" today means: **the full PWA experience —
onboarding, creating and browsing markets, betting, oracle resolution,
Cashier escrow, and the underlying on-chain zkApp calls — all run from the
browser alone, with no desktop app and no backend server.** IPFS (market
metadata) and a funded Mina Devnet wallet (every on-chain call) are the only
external dependencies, both covered below.

---

## 1. Mina Devnet (zkApp contracts)

Devnet is Mina's public test network — real network, test-value MINA, no
money at risk.

### 1.1 Deploy with the provided script

```bash
cd contracts
npm run build
node build/scripts/deploy-devnet.js
```

[`contracts/scripts/deploy-devnet.ts`](./contracts/scripts/deploy-devnet.ts)
deploys and configures `MarketSettlement` end-to-end:

1. If `DEVNET_DEPLOYER_KEY` isn't set, it generates a fresh key and calls
   `Mina.faucet()` — o1js's built-in Devnet faucet client (solves the ZK
   captcha for you). **Save the printed private key** — the faucet funds
   each address only once.
2. Compiles the contract (`MarketSettlement.compile()` — first run takes
   minutes; it's building/caching the proving keys).
3. Deploys it, then calls `configure(adminPublicKey, oraclePublicKey)`.
4. Prints the deployed zkApp address and a `minascan.io/devnet` explorer
   link.

```bash
# reuse a funded deployer across runs
DEVNET_DEPLOYER_KEY=EKE... node build/scripts/deploy-devnet.js

# use real, separate admin/oracle keys instead of the deployer's own
MARKET_ADMIN_PUBLIC_KEY=B62... MARKET_ORACLE_PUBLIC_KEY=B62... \
  DEVNET_DEPLOYER_KEY=EKE... node build/scripts/deploy-devnet.js
```

### 1.2 Deploying the other two contracts (standalone reference deploy only)

This is for a one-off reference deployment from the CLI (e.g. to inspect a
contract on minascan without going through the UI, or to wire into a CI
job). **Normal usage doesn't need this** — `CreateMarketModal`'s "Deploy
real on-chain contracts" checkbox deploys a fresh `VilcoinLedger` +
`MarketSettlement` pair per market directly from the browser (§0), and
Expert Mode's Cashier escrow panel deploys a fresh `CashierEscrow` per
trade the same way (§1.3).

The script only covers `MarketSettlement`. `VilcoinLedger` and
`CashierEscrow` follow the identical `Mina.Network` → compile → deploy →
one-time-configure pattern (see each contract's `lockEscrow`/`seedLiquidity`
method) — copy `deploy-devnet.ts`, swap the import and the post-deploy call:

- `VilcoinLedger`: deploy, then call `seedLiquidity(UInt64.from(initialLiquidity))`.
- `CashierEscrow`: deploy, then call
  `lockEscrow(cashierPublicKey, userPublicKey, arbiterPublicKey, amount, deadlineSlot)`.

Remember these three contracts are **per-market / per-trade instances**,
not singletons — a real deployment creates a fresh `VilcoinLedger` +
`MarketSettlement` per market, and a fresh `CashierEscrow` per trade.

### 1.3 The in-browser Mina wallet (used by all the client's on-chain actions)

Open Expert Mode → "Mina wallet (Devnet)". A Mina keypair (separate from
your Nostr identity) is generated silently on first visit and persisted to
IndexedDB (`client/src/utils/minaWalletStore.ts`); "Check balance" calls
`fetchAccount` against the public Devnet GraphQL endpoint, and "Fund via
Devnet faucet" calls o1js's built-in `Mina.faucet()` (same ZK-captcha-solving
faucet client §1.1 uses). This wallet is what signs every on-chain call the
`CreateMarketModal`, market-card buy buttons, "Resolve a market", and
"Cashier escrow" panels make — fund it before testing any of them.

### 1.4 Verifying a deployment

```bash
open "https://minascan.io/devnet/account/<zkApp address>"
```

Or re-run the equivalent of this repo's own tests against the live
address: `new MarketSettlement(PublicKey.fromBase58("<address>"))`, then
`fetchAccount` / `fetchEvents` (same APIs `contracts/tests/*.test.ts` and
`deploy-devnet.ts` already use, just pointed at a real address instead of
a freshly deployed one).

---

## 2. IPFS (market metadata)

`nostr/src/ipfs.ts`'s `IpfsClient` pins to a Kubo RPC endpoint
(`http://127.0.0.1:5001` by default) and reads through public gateways
(`ipfs.io`, `dweb.link`, `cloudflare-ipfs.com`). Two ways to make the write
side real:

### 2.1 Run your own Kubo node (free, self-hosted)

```bash
# https://docs.ipfs.tech/install/command-line/
ipfs init
ipfs daemon   # exposes the RPC API on :5001 by default — matches IpfsClient's default
```

### 2.2 Use a pinning service instead

Pass a different `apiUrl` when constructing the client — e.g. for a
service exposing a Kubo-compatible `/api/v0/add` endpoint:

```ts
import { IpfsClient } from "@villmond/nostr/ipfs.js";

const ipfs = new IpfsClient({ apiUrl: "https://<your-pinning-service-endpoint>" });
const cid = await ipfs.pinJson({ question: "...", resolutionRules: "..." });
```

Check your chosen provider's exact API-compatibility and auth requirements
first — `IpfsClient` assumes an unauthenticated Kubo-shaped `/api/v0/add`;
a provider requiring an API key/header will need a small change to
`nostr/src/ipfs.ts`'s `fetch` call (not covered by this guide, since it
touches code, not deployment).

### 2.3 Using it to create a real market

The normal path is now the PWA itself: Newbie Mode → "+ New market" →
`CreateMarketModal` pins `{ question, outcomes }` via `IpfsClient`, then
signs and publishes the `kind:30000` event. A pin failure (no reachable
IPFS node) surfaces as an error in the form rather than publishing a market
with a broken CID.

You can also do it from a script, the same way
[`DEMO.md` §3](./DEMO.md#3-phase-1--core-protocol-config-identity-nostr-events)
does, adding a real pin — useful for seeding markets before testers arrive:

```ts
const cid = await ipfs.pinJson({ question, outcomes, resolutionRules: "..." });
const market = buildMarketCreationEvent({ ...otherFields, metadataCid: cid }, secretKey);
await Promise.allSettled(client.publish(market));
```

---

## 3. Nostr (relays)

This needs **no deployment step** — `config.yaml`'s
`network.default_relays` already points at two free, public relays
(`wss://relay.damus.io`, `wss://nos.lol`), and every piece of this app that
talks to Nostr already works against them (verified live, repeatedly,
throughout this repo's development).

### 3.1 When you'd self-host a relay

Only if you want control over retention/moderation/uptime for your test
cohort, rather than depending on public infrastructure:

```bash
# any NIP-01 relay works; strfry is a common lightweight choice
git clone https://github.com/hoytech/strfry && cd strfry
# follow its build/run instructions, then add your relay's wss:// URL to
# config.yaml's network.default_relays
```

Add it alongside (not instead of) the public relays, for redundancy
(matches the PRD's RES-01 mitigation — multi-relay fallback).

---

## 4. Hosting the PWA for test users

The client is a static build — no server-side runtime needed.

```bash
cd client
npm run build       # outputs client/dist/, config.yaml included (it's symlinked into public/)
```

Deploy `client/dist/` to any static host: Cloudflare Pages, Netlify,
Vercel, GitHub Pages, or (matching the PRD's anti-censorship design, threat
CENS-01) IPFS + ENS/Unstoppable Domains. Whichever host you pick, confirm
`config.yaml` is actually served at `/config.yaml` relative to the deployed
root — the app fetches it at runtime (`client/src/utils/config.ts`), it
isn't bundled into the JS at build time, so a white-label deployer can swap
branding/relays without rebuilding.

### 4.1 Before testers arrive

- Decide `config.economy.enable_cashier_network` deliberately — it's
  `false` by default (PRD's LEG-01 mitigation); only flip it if your
  jurisdiction and test cohort make that appropriate.
- Make sure an IPFS node is reachable before testers arrive (§2) — market
  creation from the UI depends on it.
- Tell testers up front what §0 says: creating a market, betting, and
  quoting all publish real signed Nostr events to public relays testers
  don't control — nothing sensitive is in those events, but
  they are genuinely public and persistent once relays have them.
- Point testers at [`DEMO.md`](./DEMO.md) for a feature-by-feature tour,
  so they know what to expect walking in (including which parts are
  Nostr-live vs. contract-level-only today, per §0 above).
