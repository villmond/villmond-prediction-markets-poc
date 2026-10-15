# Demo Guide: villmond-prediction-markets-poc

Step-by-step instructions to run and demonstrate every feature implemented
so far (PRD Phases 1–4). See [`README.md`](./README.md) for the project
overview and [`product_requirements_document_prd.md`](./product_requirements_document_prd.md)
for the full specification.

Estimated time for a full walkthrough: **20–30 minutes**.

---

## 0. Prerequisites

- **Node.js ≥ 22** (the repo was built and tested on Node 22.x; `o1js`'s
  zkApp proving and `node:test` both need a recent runtime).
- **npm** (ships with Node).
- On Windows, o1js's optional native (non-WASM) prover isn't published for
  `win32-x64` as of o1js 3.x — compiling falls back to the WASM prover
  automatically (slower locally, no functional difference; CI runs on
  Ubuntu either way).
- A terminal and a browser. No Docker, no external services, no API keys —
  the whole stack runs locally.

Check your Node version:

```bash
node -v   # expect v22.x or newer
```

---

## 1. Install

From the repository root:

```bash
npm install
```

This installs dependencies for all four workspaces (`nostr`, `contracts`,
`client`) plus the root-level tooling (Cucumber, ESLint, tsx) in one pass,
via npm workspaces.

---

## 2. The fast way: run everything automated

If you just want proof the whole system works end-to-end before digging
into any one feature:

```bash
npm run build     # compiles nostr, contracts, and the client PWA
npm test          # 23 nostr unit tests (vitest) + 16 contract tests (node:test, real local-Mina transactions)
npm run test:bdd  # 16 Cucumber/Gherkin scenarios, 65 steps, also against real local-Mina transactions
npm run lint      # typecheck (all 4 tsconfigs) + ESLint across the whole monorepo
npm audit         # 0 known vulnerabilities, enforced in CI
```

All five should finish green. Everything below walks through the same
functionality interactively, feature by feature.

---

## 3. Phase 1 — Core Protocol: config, identity, Nostr events

These are the building blocks everything else sits on. A short Node REPL
session demonstrates them directly against the built package.

```bash
cd nostr
node --experimental-repl-await
```

```js
// White-label config loading (reads the root config.yaml, validated).
const { loadConfig, generateKeypair, buildMarketCreationEvent, buildBetPlacementEvent } =
  await import("./dist/index.js");

const config = loadConfig("../config.yaml");
config.app.name;                       // "Villmond Markets"
config.economy.initial_user_balance;   // 1000
config.economy.enable_cashier_network; // false — off by default (PRD LEG-01)

// Zero-app onboarding: instant client-side keypair, no signup.
const identity = generateKeypair();
identity.npub;  // "npub1..."
identity.nsec;  // "nsec1..." — the backup key a user would save

// Build a signed market-creation event (kind:30000) — this is what gets
// broadcast to Nostr relays when someone creates a market.
const secretKey = Buffer.from(identity.secretKeyHex, "hex");
const market = buildMarketCreationEvent(
  {
    marketId: "demo-market-1",
    question: "Will it rain in San Francisco tomorrow?",
    outcomeType: "binary",
    outcomes: ["Yes", "No"],
    metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    closesAt: Math.floor(Date.now() / 1000) + 86400,
  },
  secretKey,
);
market.kind; // 30000
market.sig;  // a real Schnorr signature over the event

// Build a signed bet-placement event referencing that market.
const bet = buildBetPlacementEvent(
  { marketEventId: market.id, outcomeIndex: 0, amount: 10 },
  secretKey,
);
bet.tags; // [["e", market.id], ["outcome_index", "0"], ["amount", "10"]]
```

`.exit` to leave the REPL. This is exactly the logic the PWA client and the
BDD suite exercise — you've just run it by hand.

**What to point out:** no server, no database — `loadConfig`, keypair
generation, and event signing are pure functions. The only network calls in
the whole stack happen when the client subscribes to or publishes on Nostr
relays (Phase 3) or calls the Mina network (Phase 2/4, local-only here).

---

## 4. Phase 2 — ZK smart contracts (Mina `o1js`)

The contracts are the trust anchor: they *prove* market settlement and the
admin fee cut, rather than trusting a server.

```bash
cd contracts
npm test
```

Watch the output — `node:test` runs all three contracts against a real
local Mina blockchain (not mocks):

- **`VilcoinLedger`** — an AMM liquidity pool. The test log shows a
  constant-product (`x·y=k`) swap actually moving the curve.
- **`MarketSettlement`** — resolves a market from an oracle's signature and
  proves the admin fee split (2.5% of the pool, hardcoded in the contract
  per PRD 5.5, not configurable post-deploy). Includes a regression test
  proving a signature can't be replayed against a *different* deployed
  market contract.
- **`CashierEscrow`** — locks a Cashier's VILCOIN bond, releases it on
  signature, slashes it automatically on timeout, or lets a designated
  arbiter break a dispute. Also includes a replay-protection regression
  test.

**What to point out:** every `it(...)` block deploys a fresh zkApp, builds a
real `Mina.transaction`, calls `.prove()`, and signs/sends it — these are
genuine zero-knowledge proofs being generated and verified, just against a
local, instant-finality test network instead of Devnet/Mainnet.

To see one contract's source directly: open
[`contracts/src/MarketSettlement.ts`](./contracts/src/MarketSettlement.ts)
and look at `resolveMarket()` — the admin fee is computed from a hardcoded
`ADMIN_FEE_BPS` constant, not a mutable field, so neither the market creator
nor the oracle can tamper with the cut.

---

## 5. Phase 2 — BDD acceptance tests (Cucumber/Gherkin)

The same contracts (and the Phase 1/3 logic) are also described in
human-readable scenarios that a non-engineer can read:

```bash
cd ..   # repo root
npm run test:bdd
```

Open a feature file while it runs, e.g.
[`features/market_settlement.feature`](./features/market_settlement.feature):

```gherkin
Scenario: The designated oracle resolves a market and the admin fee is proven
  When the oracle resolves the market with a total pool of 10000 VILCOIN and winning outcome 0
  Then the market is marked resolved
  And the proven admin fee is 250 VILCOIN
```

**What to point out:** these aren't just prose next to the tests — each
`When`/`Then` line is backed by a real step definition in
[`features/step_definitions/`](./features/step_definitions/) that runs the
same zkApp/Nostr code as the unit tests, just phrased as business rules.
There are three other feature files:
[`onboarding.feature`](./features/onboarding.feature),
[`oracle_ranking.feature`](./features/oracle_ranking.feature), and
[`cashier_escrow.feature`](./features/cashier_escrow.feature).

---

## 6. Phase 3 — The mobile PWA (Dual-UX)

This is the interactive part — a real React app in a real browser.

```bash
npm run dev --workspace client
```

Open the printed URL (default `http://localhost:5173`) in a browser. For
the full mobile experience, open your browser's device toolbar (Chrome
DevTools → "Toggle device toolbar", or equivalent) and pick a phone preset
in the 375–430px width range — the UI is designed mobile-first for exactly
that range.

### 6.1 Zero-app onboarding

On first load, open the browser console and watch — no network request for
login happens. A keypair is generated silently and written to **IndexedDB**
(Application tab → IndexedDB → `villmond` → `identity` in DevTools, if you
want to see it directly).

You'll see:

1. A **3-step onboarding wizard** (Newbie Mode only) explaining VILCOIN,
   how odds shift, and how to place a first prediction. Click through it or
   hit "Skip".
2. A **backup-key banner** ("Save your backup key…") — only shown because
   this is a *freshly generated* identity. Click "Reveal backup key" to see
   the `nsec`. Reload the page: the banner is gone, because `useIdentity`
   found the same identity already in IndexedDB — onboarding doesn't repeat.

### 6.2 Newbie Mode — market cards

With "Markets" selected in the bottom tab bar, you'll see a "+ New market"
button and a live market list. If no markets matching this app's schema
exist on the configured public relays yet, you'll see "No markets yet.
Listening…" — that's correct, honest behavior, not a bug (see §6.4 on
creating one).

Each market card shows the question, a real "closes in" chip computed from
the market's own `closesAt` field, and the outcome buttons. Tapping Yes/No
always publishes a real signed `kind:7001` bet event; for markets deployed
with the on-chain checkbox (§6.4), the same tap also sends a real
`VilcoinLedger.buyOutcomeA/B` zkApp call signed by your Mina wallet (status
line under the buttons shows the transaction hash) — markets without an
on-chain ledger, including ones from other Nostr-only clients, show the
honest "live odds need on-chain AMM data" note instead (deliberately not
faked — see the code-review note in `README.md`).

### 6.3 Expert Mode — raw protocol visibility

Tap "Expert" in the bottom tab bar. You'll see:

- **Connected relays** — the exact `wss://` URLs from `config.yaml`.
- **Key management** — your `npub` and `nsec` in full, for power users who
  want to export/import their identity manually.
- **Raw event log** — the live, unfiltered JSON of every Nostr event
  arriving from the relays, kind and all. This is genuinely live network
  traffic from public relays (`relay.damus.io`, `nos.lol`), not mocked data.
- **Mina wallet (Devnet)** — a separate keypair (Pallas curve, not Nostr's
  secp256k1), generated silently on first visit, that signs every on-chain
  zkApp call this app makes. "Check balance" calls `fetchAccount` against
  Devnet; "Fund via Devnet faucet" calls o1js's built-in captcha-solving
  faucet. Fund this before trying any of the on-chain actions below.
- **Oracle reputation** — look up any oracle by npub/hex key and see/submit
  rating events (`kind:1985`).
- **Resolve a market** — picks from markets that were deployed with an
  on-chain settlement contract (§6.4) and calls `MarketSettlement.resolveMarket`
  directly, signed by your Mina wallet acting as oracle.
- **Cashier escrow (on-chain)**, shown only when `enable_cashier_network: true`
  (§7) — locks a fresh `CashierEscrow` for a trade and releases/slashes/
  arbitrates it, all real on-chain calls, no address directory (any key can
  act as cashier/arbiter per trade by design).

### 6.4 Creating a market

Tap "+ New market" in Newbie Mode. Fill in a question, pick Binary or
Multiple choice (2–6 outcomes), pick a "closes in" window, and tap
"Publish market". Behind the scenes `CreateMarketModal` pins
`{ question, outcomes }` to IPFS via `IpfsClient`, then signs and publishes
a real `kind:30000` event with the resulting CID — **this needs a reachable
IPFS node** (`DEPLOYMENT.md` §2); with none running, the form shows a clear
error instead of publishing a market with a broken metadata reference.

Check **"Deploy real on-chain contracts (Mina Devnet)"** to also deploy a
real `VilcoinLedger` + `MarketSettlement` pair (needs a funded Mina wallet
— §6.3's Mina wallet card, and `DEPLOYMENT.md` §1.3 for funding it). Enter
an initial liquidity amount and the resolving oracle's Mina address; your
own wallet becomes the market's admin. First use compiles both contracts'
proving keys client-side, which can take tens of seconds — the button shows
"Deploying…" while that and the three deploy/seed/configure transactions
run. The published event then carries `ledger_address`/`settlement_address`
tags, which is what makes the market card's bet buttons (§6.2) and the
"Resolve a market" panel (§6.3) work against it.

Your market should then appear in Newbie Mode's list for anyone on the same
relays, with working "Yes"/"No" (or your custom outcomes) one-tap bet
buttons that build and publish a real signed `kind:7001` bet event when
clicked (check the Expert Mode raw log to see it land).

You can also create one from the Node REPL (§3) using `relayPool.ts` —
useful for seeding markets from a script rather than the UI:

```js
const { MarketRelayClient } = await import("./dist/relayPool.js");
const client = new MarketRelayClient(["wss://relay.damus.io", "wss://nos.lol"]);
// publish() returns one promise per relay — await them so a relay timeout
// doesn't surface as an unhandled rejection.
await Promise.allSettled(client.publish(market)); // `market` from the §3 REPL session
```

---

## 7. Phase 4 — P2P Cashier network

The Cashier network is **disabled by default** (`config.yaml` →
`economy.enable_cashier_network: false`), matching the PRD's LEG-01 legal
mitigation (money-transmitter risk). To demo it:

```bash
# from the repo root, with the dev server from §6 stopped or in another terminal
sed -i '' 's/enable_cashier_network: false/enable_cashier_network: true/' config.yaml
npm run dev --workspace client
```

Reload the PWA, switch to Expert Mode. A **"P2P Cashier desk"** card and a
**"Cashier escrow (on-chain)"** card now appear below the raw event log:

1. The desk subscribes to `kind:30078` liquidity-quote events over the same
   relay connection the market subscription already uses (one shared
   WebSocket pool, not a second one — a fix from the code-review pass).
2. Fill in the form — side, currency, amount, price, and a latitude/longitude
   (try `37.7793, -122.4193`, San Francisco) — and watch the "Coarse
   location" line compute a real geohash (`9q8yy`) client-side.
3. Click "Post quote". It signs and publishes a real `kind:30078` event;
   check the raw event log above to see it (and, if someone else is running
   the same demo against the same relays, their quote appearing in yours).

**Revert the config change when you're done** — this flag should stay
`false` by default:

```bash
sed -i '' 's/enable_cashier_network: true/enable_cashier_network: false/' config.yaml
```

### 7.1 The on-chain escrow contract

The fund-safety logic lives in
[`contracts/src/CashierEscrow.ts`](./contracts/src/CashierEscrow.ts), and the
**"Cashier escrow (on-chain)" panel calls it directly from the browser** —
the Cashier desk above only handles off-chain quote discovery, but escrow
itself is real: "Lock a new escrow" deploys a fresh `CashierEscrow` and locks
a bond between a cashier, user, and arbiter Mina address (all manual entry —
there's no address directory by design, any key can act as cashier/arbiter
per trade); "Act on an existing escrow" then releases, timeout-slashes, or
arbiter-resolves it by address. Needs a funded Mina wallet (§6.3).

To see the same escrow logic proven outside the browser:

```bash
cd contracts
node --test build/tests/CashierEscrow.test.js
```

This exercises, against a real local Mina chain: locking a bond, a cashier
releasing it normally, an automatic timeout-slash forfeiting the full bond
to the user once the deadline slot passes, and an arbiter breaking a
dispute — plus the replay-protection regression test added during the
code-review pass.

---

## 8. Code quality tooling

```bash
npm run lint       # tsc --noEmit × 4 tsconfigs, then ESLint over the whole repo
npm run lint:fix    # auto-fixes what ESLint can fix safely
npm audit           # dependency vulnerability scan (also runs in CI)
```

`eslint.config.js` documents every rule override inline with a reason (e.g.
why `@typescript-eslint/require-await` is off for `contracts/src/` — o1js
requires `@method` handlers to be `async` even with no internal `await`).

---

## 9. Continuous integration & releases

Pushing to `main` or opening a PR runs
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) (build, unit
tests, BDD, lint, `npm audit`) and
[`.github/workflows/codeql.yml`](./.github/workflows/codeql.yml) (static
security analysis). [Dependabot](./.github/dependabot.yml) opens weekly
dependency-update PRs.

Pushing a tag matching `v*.*.*` (e.g. `git tag v0.2.0 && git push --tags`)
triggers [`.github/workflows/release.yml`](./.github/workflows/release.yml):
it re-runs the full verification gate, then publishes a GitHub Release
(auto-generated notes, the built client PWA attached as a zip) — marked
`prerelease` until the PRD's Phase 4 threat-model/security-audit step
actually happens (see [`SECURITY.md`](./SECURITY.md)).

---

## Troubleshooting

- **"WebSocket connection ... failed" in the browser console.** Expected
  occasionally — these are real public relays with their own uptime. The
  app degrades gracefully (shows "No markets yet" / an empty quote list)
  rather than crashing.
- **Nothing appears in Newbie Mode's market list.** Either no one has
  published a `kind:30000` event matching this app's exact tag schema on
  the configured relays recently, or the relays are unreachable. Publish
  one yourself per §6.4.
- **`npm test` contracts step is slow (~5–8s).** That's real zkApp proof
  generation/verification against a local Mina chain, not a hung process.
