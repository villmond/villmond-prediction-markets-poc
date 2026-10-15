# Administration Guide: roles, authorization, and production setup

This is for whoever **operates** a `villmond-prediction-markets-poc`
deployment — deciding who your Admin, Oracles, and Cashiers are, and putting
the app on real infrastructure (Mina testnet, IPFS, Nostr). For a local
feature walkthrough, see [`DEMO.md`](./DEMO.md); for the deployment
mechanics this guide assumes, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## 0. Read this first: two separate authorization layers

This app has **two independent notions of "who's the admin/oracle/cashier,"
and conflating them is the most common setup mistake:**

1. **`config.yaml`'s directories — informational only, UI badges.**
   `economy.admin_public_key`, `oracles.designated_public_keys`,
   `cashier_module.designated_public_keys` hold **Nostr** keys (`npub`/hex).
   The client compares a visitor's Nostr identity against these lists
   (`client/src/utils/roles.ts`) purely to show a badge ("you might be the
   admin/an oracle/a cashier"). **Setting these does not grant anyone any
   power.** There's no enforcement behind them.
2. **Per-contract Mina keys — the real, cryptographic authority.**
   Every `MarketSettlement` is deployed with its own `adminPublicKey` and
   `oraclePublicKey` (Mina/Pallas keys, `B62...`), set once at deploy time
   via `configure()` and never read from `config.yaml`. Every
   `CashierEscrow` is locked with its own `cashierPublicKey`/
   `userPublicKey`/`arbiterPublicKey`, chosen per trade. **Only a signature
   from the exact key a contract instance was configured with is ever
   accepted** — the contracts have no idea `config.yaml` exists.

So administering this app is really: (a) optionally curate the `config.yaml`
directories so the UI badges people correctly, and (b) actually control the
Mina private keys that get wired into each deployed contract — that's where
the real admin/oracle/cashier power lives.

---

## 1. Setting up the Admin

**UI badge (optional, cosmetic):** set `economy.admin_public_key` in
`config.yaml` to the admin's Nostr `npub` or hex pubkey.

**Real authority (per market):** the Mina `adminPublicKey` configured on a
market's `MarketSettlement` contract. There are two ways a market gets
deployed:

- **From the PWA** (Newbie Mode → "+ New market" → "Deploy real on-chain
  contracts" checkbox): the market creator's own browser-generated Mina
  wallet becomes that market's admin automatically. There's currently no UI
  field to set a different admin — see §4 if you need a stable, reused
  admin key across markets instead of "whoever created this market."
- **From the CLI reference script** (`contracts/scripts/deploy-devnet.ts`,
  see §6): pass `MARKET_ADMIN_PUBLIC_KEY=B62...` to set a specific admin
  key explicitly, independent of the deployer key.

**Admin fee — a real gotcha:** `economy.admin_fee_percentage: 2.5` in
`config.yaml` is **not read by the contract at runtime.** The fee is a
hardcoded constant, `ADMIN_FEE_BPS = 250n`, in
[`contracts/src/MarketSettlement.ts`](./contracts/src/MarketSettlement.ts).
If you change the config value, you must also edit `ADMIN_FEE_BPS` to match
(in basis points: 2.5% = 250), then `npm run build --workspace=@villmond/contracts`
and redeploy — editing `config.yaml` alone changes nothing on-chain. Keep
the two in sync or the config value becomes misleading documentation.

What the admin actually receives: `MarketSettlement.resolveMarket()` proves
the fee calculation and emits it in the `resolved` event
(`adminFee = totalPool * ADMIN_FEE_BPS / 10000`); crediting the admin's
VILCOIN balance by that amount is an off-chain step your Nostr-event
listener performs (same pattern as every other balance update in this
closed-loop system — see `README.md`'s architecture notes).

---

## 2. Setting up Oracles

**UI badge + reputation gating (optional):** add the oracle's Nostr
`npub`/hex to `oracles.designated_public_keys`, and set
`oracles.min_reputation_threshold` (checked against `kind:1985` rating
events in Expert Mode's "Oracle reputation" panel — informational, not
enforced on-chain either).

**Real authority (per market):** the Mina `oraclePublicKey` configured on
that market's `MarketSettlement`, set the same two ways as the admin key
above:

- PWA: enter the oracle's Mina address (`B62...`) in the "Oracle's Mina
  address" field when checking "Deploy real on-chain contracts."
- CLI script: `MARKET_ORACLE_PUBLIC_KEY=B62...`.

**How an oracle resolves a market:** the oracle opens the PWA in Expert
Mode, needs their Mina wallet funded (§6), then uses the **"Resolve a
market"** panel — it lists markets with a known `settlementAddress`, lets
them pick the winning outcome and enter the total pool, and signs/sends
`MarketSettlement.resolveMarket()` directly from the browser. **The wallet
signing this must be the exact one whose public key was passed as
`oraclePublicKey` at deploy time** — any other key's signature is rejected
by the contract itself (`oracleSignature.verify(...).assertTrue()` in
`resolveMarket`). See §4 for getting a specific, pre-chosen Mina key loaded
into that browser's wallet.

---

## 3. Setting up Cashiers

**Master switch:** `economy.enable_cashier_network: true` (default
`false`, matching the PRD's LEG-01 money-transmitter mitigation — only
enable this if you've made the legal/compliance call to run it).

**Config (`cashier_module`):**
- `supported_currencies` — shown in the quote-posting form.
- `min_cashier_stake` — **documentation only; not enforced by the contract.**
  `CashierEscrow.ts`'s own comment states this plainly: "satisfying
  `cashier_module.min_cashier_stake` is an off-chain/UI precondition, not
  enforced here." A cashier can lock any `amount > 0`. If you need this
  enforced, it requires a contract change (add an assertion in
  `lockEscrow`), not a config change.
- `escrow_timeout_blocks` — informational; the actual timeout is the
  `releaseDeadlineSlot` passed to `lockEscrow()` per trade (manual entry
  today, see below) — keep them consistent by convention, since nothing
  ties them together automatically.
- `designated_public_keys` — UI badge directory only (Nostr keys), same
  caveat as admin/oracle.

**Real authority (per trade — no directory, by design):** the PRD's P2P
Cashier model lets *any* key act as cashier/arbiter per trade, enforced
cryptographically, not via a membership list. In Expert Mode's "Cashier
escrow (on-chain)" panel:

1. **Lock a new escrow** — enter the cashier's, the user's, and the
   arbiter's Mina addresses plus the amount and a deadline slot, and submit.
   This deploys a fresh `CashierEscrow` instance and locks the bond —
   signed by whoever's wallet is active in that browser (typically the
   cashier, funding their own bond).
2. **Act on an existing escrow** — given the deployed escrow's address:
   "Release (as cashier)" needs the cashier's wallet active; "Timeout
   slash" can be sent by anyone once the deadline slot has passed;
   "Arbiter resolve" needs the arbiter's wallet active and picks who the
   bond goes to.

Every one of these is a direct signature check against the address baked
into that specific `CashierEscrow` instance at lock time — there's nothing
to "set up" centrally beyond deciding, out of band, who holds the
cashier/arbiter keys for a given trade.

---

## 4. Getting a specific Mina key into the browser (admin/oracle/cashier)

**Current limitation, stated plainly:** the PWA's Mina wallet
(`client/src/hooks/useMinaWallet.ts`) only auto-generates a fresh key on
first visit and stores it in IndexedDB — there is no UI to import a
specific, pre-existing Mina private key (unlike the Nostr identity, which
has `nsec` import support). If you need a *stable, reused* admin/oracle/
cashier identity (e.g. "the same Mina address resolves every market"),
rather than a fresh one per browser/device, you have two options:

**Option A — seed IndexedDB directly (same browser profile only).** Open
DevTools → Console on the app's origin, before the app's first load (or
after clearing the existing key), and run:

```js
const db = indexedDB.open("villmond", 2);
db.onsuccess = () => {
  const tx = db.result.transaction("mina-wallet", "readwrite");
  tx.objectStore("mina-wallet").put("EKE...your base58 private key...", "default");
};
```

Reload the page afterward — `useMinaWallet` will load this key instead of
generating a new one. Treat this exactly like handling a raw secret key:
never run this snippet against an origin or key you don't control, and
clear the key from `localStorage`/console history afterward if the machine
is shared.

**Option B — use the CLI script's keys as your reference identity**, and
have the human oracle/admin operate from that key *outside* the browser for
anything sensitive (e.g. a script that builds and signs the resolution
transaction directly with `o1js`, following the same pattern as
`deploy-devnet.ts` / `resolveMarketOnChain` in
`client/src/utils/minaContracts.ts`), using the PWA only for browsing/UI.

Option A is simpler for a demo/pilot deployment; Option B is more
appropriate once a key represents real authority you don't want sitting in
a browser's IndexedDB.

---

## 5. Production config.yaml: how it's actually loaded

`config.yaml` is fetched as a **static asset at runtime**
(`client/src/utils/config.ts` does `fetch("/config.yaml")`), not baked into
the JS bundle at build time. In the repo, `client/public/config.yaml` is a
symlink to the repo-root `config.yaml`, so:

- Most of this guide's settings (`app.name`, branding, relay list, the
  three `designated_public_keys` directories, `min_reputation_threshold`,
  `enable_cashier_network`, currencies, stake/timeout numbers) can be
  changed **by replacing the deployed `config.yaml` file on your host**,
  with no rebuild needed.
- The one exception is `economy.admin_fee_percentage` — see §1, it requires
  a contract rebuild/redeploy to actually take effect on-chain; the config
  value alone only affects what the UI *displays*, if anything reads it for
  that purpose.

---

## 6. Deploying to Mina testnet (Devnet)

Mina's public test network is called **Devnet** — real network, test-value
MINA, no money at risk. Two deployment paths exist; use the one matching
what you're setting up:

**o1js is pinned to `^3.1.0`**, which targets the **Mesa** protocol hard
fork (Devnet forked 2026-08-19, mainnet 2026-09-03) — required, since the
live Devnet stopped accepting pre-Mesa (o1js 2.x) transaction formats on
that date. Mesa also changed contract verification keys (twice: the
protocol retarget, then a 3.1.0 security fix), so **any contract address
deployed before this version has a stale verification key and must be
redeployed** — there's no in-place upgrade. This only affects a standalone
reference deployment (§6.2); markets/trades deployed through the PWA (§6.1)
are always fresh and unaffected.

### 6.1 Per-market / per-trade contracts (what end users do)

No separate "deploy" step for you to run — this already happens from the
browser:

- A market's `VilcoinLedger` + `MarketSettlement` pair deploys when a user
  checks "Deploy real on-chain contracts" in "+ New market" (§1–2 above).
- A trade's `CashierEscrow` deploys when a cashier uses "Lock a new escrow"
  (§3 above).

All of it needs a Devnet-funded Mina wallet in that browser — Expert Mode →
"Mina wallet (Devnet)" → "Fund via Devnet faucet" (o1js's built-in
captcha-solving faucet client, rate-limited to once per address).

### 6.2 A standalone reference `MarketSettlement` (what you, the operator, might deploy)

Useful for a known-good instance to point testers at, or to wire into CI,
independent of any one user's browser session:

```bash
cd contracts
npm run build

# generates + faucet-funds a fresh deployer if DEVNET_DEPLOYER_KEY is unset
# (prints the key — save it, the faucet funds each address once)
DEVNET_DEPLOYER_KEY=EKE... \
MARKET_ADMIN_PUBLIC_KEY=B62... \
MARKET_ORACLE_PUBLIC_KEY=B62... \
  node build/scripts/deploy-devnet.js
```

This prints the deployed zkApp address and a `minascan.io/devnet` explorer
link. `VilcoinLedger`/`CashierEscrow` follow the identical pattern — copy
the script, swap the import and the post-deploy call (`seedLiquidity(...)`
/ `lockEscrow(...)`) — see `DEPLOYMENT.md` §1.2 for the exact calls.

Verify any deployment with:

```bash
open "https://minascan.io/devnet/account/<zkApp address>"
```

---

## 7. Deploying IPFS: public gateways and pinning services (Pinata, etc.)

`nostr/src/ipfs.ts`'s `IpfsClient` has two independent halves:

- **Reads already use public gateways by default — no setup needed.**
  `ipfs.io`, `dweb.link`, `cloudflare-ipfs.com` are raced in parallel;
  first successful response wins. Anyone can read pinned market metadata
  with zero configuration on your part.
- **Writes (pinning) need a reachable Kubo-RPC-compatible `/api/v0/add`
  endpoint**, configured via `apiUrl` (default `http://127.0.0.1:5001`).

### 7.1 Self-hosted Kubo (works today, zero code changes)

```bash
# https://docs.ipfs.tech/install/command-line/
ipfs init
ipfs daemon   # exposes the RPC API on :5001 by default
```

Point `IpfsClient` at it (it's the default) or expose your node's `:5001`
behind your own reverse proxy if the PWA and the node aren't on the same
machine.

### 7.2 Using a pinning service like Pinata — the one real gap

**Be aware before you plan around this:** `IpfsClient`'s `pinJson()` sends
an unauthenticated `POST`. Pinata (and most hosted pinning services) require
an `Authorization: Bearer <JWT>` header or API-key headers on every pin
request — there is currently **no way to supply that through configuration
alone**. This isn't a Pinata-specific quirk; it's that `IpfsClient` was
built against Kubo's open local RPC API, which has no auth concept.

If you need Pinata (or a similar authenticated service) in production, the
minimal change is to let `IpfsClient` accept extra headers, e.g.:

```ts
// nostr/src/ipfs.ts
export interface IpfsClientOptions {
  apiUrl?: string;
  gateways?: string[];
  headers?: Record<string, string>; // new
}

// in the constructor: this.headers = options.headers ?? {};
// in pinJson()'s fetch call: headers: this.headers,
```

Then construct the client with Pinata's JWT:

```ts
const ipfs = new IpfsClient({
  apiUrl: "https://api.pinata.cloud/pinning/pinJSONToIPFS", // Pinata's own endpoint shape differs from raw Kubo — see note below
  headers: { Authorization: `Bearer ${PINATA_JWT}` },
});
```

**One more wrinkle:** Pinata's dedicated `pinJSONToIPFS` endpoint doesn't
take the same `multipart/form-data` "file" shape `pinJson()` builds for raw
Kubo's `/api/v0/add` — it expects a JSON body
(`{ pinataContent: {...} }`). So a real Pinata integration needs the method
body changed too, not just the headers. Treat the snippet above as the
shape of the change, not a drop-in patch; verify against Pinata's current
API docs before relying on it. This is a source change requiring
`npm run build --workspace=@villmond/nostr` (or an equivalent client-side
patch) and redeploying the PWA — not something achievable by editing
`config.yaml`.

**If you don't want to touch code:** any Kubo-RPC-*compatible*,
unauthenticated pinning endpoint works as a drop-in `apiUrl` today (e.g.
your own Kubo node reachable over the network, optionally behind a reverse
proxy that injects the auth header for you server-side — that keeps the
secret out of the client bundle entirely, which is also the safer pattern
for a public PWA regardless of which pinning service you choose).

### 7.3 Creating a market once pinning is wired

No separate step — this is just the normal "+ New market" flow (§1 of
`DEMO.md`): `CreateMarketModal` calls `ipfs.pinJson({ question, outcomes })`
before signing and publishing the `kind:30000` event. A pin failure (node
unreachable, bad auth) surfaces as a form error rather than silently
publishing a market with a broken metadata CID.

---

## 8. Deploying Nostr (relays)

**No deployment step needed by default.** `config.yaml`'s
`network.default_relays` already points at two free, public relays
(`wss://relay.damus.io`, `wss://nos.lol`), and every feature in this app —
markets, bets, oracle ratings, Cashier quotes — talks to them with zero
setup.

**Self-host a relay only if you need control over retention, moderation, or
uptime** for your deployment, rather than depending on public
infrastructure:

```bash
# any NIP-01 relay works; strfry is a common lightweight choice
git clone https://github.com/hoytech/strfry && cd strfry
# follow its build/run instructions, then add your relay's wss:// URL to
# config.yaml's network.default_relays
```

Since `config.yaml` is fetched at runtime (§5), adding/removing relays is a
file swap on your host, not a rebuild.

---

## 9. Quick reference: what to set where

| Role    | `config.yaml` (badge only)              | Real authority (per instance)                                   |
|---------|------------------------------------------|-------------------------------------------------------------------|
| Admin   | `economy.admin_public_key` (npub)         | `MarketSettlement`'s `adminPublicKey` (Mina, set at deploy)       |
| Oracle  | `oracles.designated_public_keys` (npub[]) | `MarketSettlement`'s `oraclePublicKey` (Mina, set at deploy)      |
| Cashier | `cashier_module.designated_public_keys`   | Per-trade `cashierPublicKey`/`arbiterPublicKey` (Mina, at lock)   |

Nothing in the left column grants power. Everything in the right column
does, and is controlled entirely by who holds the matching Mina private key
— see §4 if that needs to be a specific, stable key rather than whatever a
browser auto-generated.
