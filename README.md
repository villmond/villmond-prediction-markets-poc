# villmond-prediction-markets-poc

Open-source, white-label, zero-knowledge prediction market framework
inspired conceptually by Manifold, anchored by a strictly closed-loop,
non-monetizable **VILCOIN** virtual credit system. See
[`product_requirements_document_prd.md`](./product_requirements_document_prd.md)
for the full specification, [`DEMO.md`](./DEMO.md) for a step-by-step
walkthrough of every feature below, [`DEPLOYMENT.md`](./DEPLOYMENT.md)
for deploying to Mina Devnet, IPFS, and Nostr to expose the app to test
users, and [`ADMINISTRATION.md`](./ADMINISTRATION.md) for setting up the
Admin/Oracle/Cashier roles and running production infrastructure.

## Status: Phase 4 — P2P Cashier Network & Hardening

Implements the Phase 1–4 milestones from the PRD roadmap (section 8):

**Phase 1 — Core Protocol & Event Architecture**
- Root `config.yaml` white-label configuration + typed loader (`nostr/src/config.ts`).
- Nostr event utilities (`nostr/src/`):
  - `keypair.ts` — zero-app client-side keypair generation (`nsec`/`npub`).
  - `marketEvents.ts` — market creation (`kind: 30000`) and bet placement event builders/parsers.
  - `oracleReputation.ts` — oracle rating events (`kind: 1985`) and reliability-score aggregation.
  - `ipfs.ts` — IPFS client wrapper for pinning/fetching static market metadata.
  - `relayPool.ts` — `SimplePool`-based market event subscription/publish client.

**Phase 2 — ZK Smart Contracts & BDD Test Suite**
- Mina `o1js` zkApps (`contracts/src/`), on `o1js@^3.1.0` targeting the
  **Mesa** protocol hard fork (Devnet since 2026-08-19, mainnet since
  2026-09-03) — see `DEPLOYMENT.md` §0/§1 for why this isn't optional
  (pre-Mesa transaction formats stopped being accepted) and what it means
  for anything deployed under an older o1js version:
  - `VilcoinLedger.ts` — per-market AMM liquidity pool (constant-product curve).
  - `MarketSettlement.ts` — oracle-signed resolution with a hardcoded, provable admin fee cut.
- Cucumber/Gherkin BDD suite (`features/`): `onboarding.feature`, `market_settlement.feature`,
  `oracle_ranking.feature`, exercising the above through real local-Mina transactions.

**Phase 3 — Mobile PWA & Dual-UX Interface**
- `client/` — React 19 + Vite + Tailwind v4 PWA, installable (`vite-plugin-pwa`), mobile-first
  (375–430px viewport).
- Zero-app onboarding: real keypair generation persisted to IndexedDB on first visit
  (`client/src/hooks/useIdentity.ts`), survives reload, with an nsec backup-reminder banner.
- Dual-UX navigation (`client/src/context/ModeContext.tsx` + `client/src/components/BottomNav.tsx`),
  persisted to `localStorage`:
  - **Newbie Mode** — 3-step onboarding wizard, simplified market cards with one-tap betting, and
    a "+ New market" form (`client/src/components/CreateMarketModal.tsx`) that pins the question
    and outcomes to IPFS (`IpfsClient`) before signing and publishing a real `kind:30000` event —
    a pin failure surfaces as a form error rather than publishing a market with a broken CID.
  - **Expert Mode** — connected relay list, manual `nsec`/`npub` export, raw live Nostr event log.
- `client/src/hooks/useMarketEvents.ts` subscribes to real `kind:30000` events over the
  configured relays and publishes signed bet-placement events — verified end-to-end in a live
  browser against the public `wss://relay.damus.io`/`wss://nos.lol` relays from `config.yaml`.

**Visual design pass (post-Phase 4)** — a mocked-up redesign (logo, color system, mobile layout)
was approved and implemented in the real code: `client/src/components/Logo.tsx` (brand mark),
`client/src/index.css` (`@theme` token palette — Void/Surface/Spark/Ember/Yes/No — and the Space
Grotesk/Manrope font pair), and `client/src/components/BottomNav.tsx` (a bottom tab bar replacing
the old top-right mode-toggle pill, still driving the same real `mode` state — no fabricated nav
destinations were added). Verified live in-browser, including the Cashier Desk with the config
flag temporarily flipped on then reverted.

**Phase 4 — P2P Cashier Network & Hardening**
- `contracts/src/CashierEscrow.ts` — per-trade zkApp: locks a Cashier's VILCOIN bond, releases it
  on the Cashier's signature, forfeits it to the user via `timeoutSlash()` once the deadline slot
  passes, or lets a designated arbiter break a dispute (PRD 6.1, threat FUNC-01). Settlement is a
  single `escrowAmount` state field doing triple duty as lock-guard, balance, and re-entrance
  block — documented as a deliberate POC simplification of the PRD's 150%-over-collateralization
  example (full forfeiture on timeout instead).
- `nostr/src/cashierOrders.ts` — P2P Cashier liquidity quotes (`kind: 30078`) with a hand-rolled
  geohash encoder for coarse, privacy-preserving location discovery (PRD 6.1).
- `client/src/components/CashierDesk.tsx` — Expert-mode quote board + posting form, gated behind
  `config.economy.enable_cashier_network` (`false` by default, per the PRD's LEG-01 mitigation) —
  verified live in-browser with the flag temporarily flipped on, then reverted.
- `features/cashier_escrow.feature` — 7 BDD scenarios covering lock/release/timeout-slash/dispute,
  including an impostor-signature and double-lock rejection, against real local-Mina transactions.

The PRD's closing Phase 4 bullet ("conduct threat model validation, security audits, and release
Version 1.0") names a human/process step — an external security review — that this repository
cannot self-certify by writing more code. This README is not that audit; treat the codebase as a
POC pending one, and the version stays at `0.1.0` until that review happens.

## Code quality, review, and CI/CD

A full code review pass (`/code-review --level high`) covered every file in the repo (no prior
git history existed to diff against). It found and fixed 8 real issues, including two signature-
replay vulnerabilities:

- **`MarketSettlement.resolveMarket()`** and **`CashierEscrow.release()`/`arbiterResolve()`**
  signed only `[payload..., amount]`, with no binding to the specific deployed contract instance —
  a valid signature for one market/escrow was replayable against a different one sharing the same
  oracle/cashier/arbiter and a matching amount. Fixed by including `this.address` in the signed
  message on all three methods, with new regression tests (`contracts/tests/*.test.ts`) proving the
  old signature is now rejected cross-contract.
- Missing input validation on bet placement (`nostr/src/marketEvents.ts`) and Cashier order
  (`nostr/src/cashierOrders.ts`) event builders — both now reject non-positive/non-finite amounts
  before signing, matching the validation `buildOracleRatingEvent` already had.
- `parseMarketCreationEvent` silently accepted a malformed `outcome` tag (missing label) instead of
  rejecting it.
- The client's bet/quote `publish()` calls were fire-and-forget with no error handling, and
  `useMarketEvents`/`useCashierOrders` each opened their own relay WebSocket pool to the same
  relays. Both fixed by a `useRelayClient` hook: one shared pool, and `publishEvent()` awaits every
  relay's response and logs failures instead of swallowing them.
- `client/src/utils/config.ts` fetched and parsed `config.yaml` without the required-section
  validation `nostr/src/config.ts`'s `loadConfig()` already enforced server-side — a malformed
  config would crash the browser with an opaque error instead of a clear one. Fixed with matching
  validation.
- `CashierDesk`'s "Post quote" button stayed enabled for `NaN`/zero/negative amounts.

Setting up real static analysis as part of this pass also surfaced that `features/` (the BDD step
definitions) had **zero type checking** — `tsx` transpiles on the fly without ever invoking `tsc`.
Added `features/tsconfig.json`; it immediately caught a real type error in the Cashier BDD steps.

```bash
npm run lint       # tsc --noEmit across all 4 tsconfigs, then ESLint (typescript-eslint, type-aware)
npm run lint:fix   # auto-fixes what's safely fixable
npm audit          # 0 known vulnerabilities as of this writing
```

`eslint.config.js` documents every rule override inline with its reason (e.g. why
`@typescript-eslint/require-await` is off for `contracts/src/` — o1js requires `@method` handlers
to be `async` regardless of internal `await`s).

`contracts/src/*.ts`'s event classes (`EscrowLockedEvent`, `TradeEvent`, etc.) follow a
`FooShape`/`FooStruct` pattern — a named shape type plus an explicitly-typed intermediate
`const FooStruct: ReturnType<typeof Struct<FooShape>> = Struct({...})` — instead of
`class Foo extends Struct({...}) {}` directly. This isn't stylistic: TypeScript 7 hard-errors
(`TS2883`) on the direct form, because o1js's own compiled types for `Field`/`Provable`/`Bool`
are only reachable through its internal module paths, and a class's `extends` clause has no
syntax to annotate around that the way a plain `const x: Field = ...` can. The explicit
intermediate `const` sidesteps it by giving TypeScript an annotation to print instead of a
structural type to infer. Runtime behavior is unchanged (same `Struct(...)` call, same
arguments) — verified by the unmodified contracts/BDD test suites still passing 100%.

### CI/CD

- **[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)** — on every push/PR to `main`: build
  all workspaces, run the unit test suite, run the BDD suite, lint, and `npm audit`
  (`--audit-level=moderate`, fails the build on findings).
- **[`.github/workflows/codeql.yml`](./.github/workflows/codeql.yml)** — GitHub CodeQL static
  analysis (SAST) for JavaScript/TypeScript, on push/PR and weekly.
- **[`.github/dependabot.yml`](./.github/dependabot.yml)** — weekly automated dependency and
  GitHub Actions update PRs.
- **[`.github/workflows/release.yml`](./.github/workflows/release.yml)** — on pushing a tag
  matching `v*.*.*`: re-runs the full verification gate, then publishes a GitHub Release with
  auto-generated notes and the built client PWA attached as a zip (marked `prerelease` — see
  [`SECURITY.md`](./SECURITY.md) for why).

These workflows aren't live until the repo is pushed to GitHub (no remote is configured here); add
status badges to this README once it is.

## Monorepo layout

```text
villmond-prediction-markets-poc/
├── LICENSE                 # AGPLv3 + Software-As-Is & Non-Affiliation clause
├── SECURITY.md               # Vulnerability reporting policy
├── DEMO.md                   # Step-by-step walkthrough of every feature
├── DEPLOYMENT.md              # Deploying to Mina Devnet, IPFS, and Nostr
├── ADMINISTRATION.md          # Admin/Oracle/Cashier setup and production ops
├── config.yaml              # White-label global configuration (symlinked into client/public/)
├── scripts/
│   └── deploy.sh              # Configuration + deployment automation (see DEPLOYMENT.md)
├── cucumber.json             # BDD runner config
├── eslint.config.js           # Monorepo-wide ESLint flat config
├── .github/
│   ├── workflows/            # ci.yml, codeql.yml, release.yml
│   └── dependabot.yml
├── nostr/                   # Nostr event handlers, keypair gen, IPFS wrapper
│   ├── src/
│   └── tests/
├── contracts/                # Mina Protocol zkApps (o1js)
│   ├── src/
│   ├── tests/
│   └── scripts/              # deploy-devnet.ts (see DEPLOYMENT.md)
├── client/                    # Mobile-first React/Vite PWA (Dual-UX)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── context/
│   │   └── utils/
│   └── public/
├── features/                  # Cucumber/Gherkin BDD suite, with its own tsconfig.json
│   ├── step_definitions/
│   └── support/
└── product_requirements_document_prd.md
```

## Development

```bash
npm install
npm test          # unit tests: nostr (vitest) + contracts (node:test against local Mina)
npm run test:bdd  # Cucumber/Gherkin BDD suite in /features
npm run build     # compiles all workspaces, including the client PWA
npm run dev --workspace client  # Vite dev server for the PWA
```

## License

AGPLv3 with a Software-As-Is & Non-Affiliation Exemption Clause — see
[LICENSE](./LICENSE). This is open-source educational software; no
developer of this repository operates, hosts, or custodies any deployed
instance.
