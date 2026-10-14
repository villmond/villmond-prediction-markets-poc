# Product Requirements Document (PRD): villmond-prediction-markets-poc
**Document Version:** 1.0 (Complete Specification)  
**Repository Name:** `villmond-prediction-markets-poc`  
**Target Audience:** Agentic AI Engineering Teams / Autonomous Coding Agents  

---

## 1. Executive Summary & Core Architectural Invariants

**`villmond-prediction-markets-poc`** is an open-source, white-label, highly configurable decentralized prediction market framework inspired conceptually by Manifold, optimized for mobile web browsers, and anchored by zero-knowledge cryptographic privacy primitives.

To operate cleanly within permissive legal frameworks without triggering regulatory burdens associated with financial instruments, securities, or gambling, the platform enforces a non-negotiable default architectural invariant:

> **Core Invariant:** By default, the platform uses a strictly closed-loop, non-monetizable virtual credit system called **VILCOIN**. VILCOIN cannot be bought, sold, redeemed, or exchanged for fiat currency or external crypto assets on-platform. It functions purely as a reputation, prediction accuracy, and engagement scoring mechanism.

---

## 2. Product Objectives & Adoption Philosophy ("Zero-Impedance Design")

The driving UX philosophy of `villmond-prediction-markets-poc` is **Zero Friction, Zero Impedance**. Adoption barriers are minimized at every layer:

1. **Zero Financial Ramps (Default):** No native fiat-to-crypto, crypto-to-fiat, or stablecoin deposit/withdrawal mechanisms. VILCOIN holds zero monetary value off-platform by default.
2. **Zero Third-Party App Friction:** Delivered as a responsive Progressive Web App (PWA) running over standard HTTPS. **Onboarding requires no external app downloads** (no browser extensions, no external authenticator apps, no seed phrase copy-paste friction for newbies).
3. **Decentralized & Censorship-Resistant:** No central database or single point of failure. Market metadata, state synchronization, and resolution logic rely entirely on IPFS, Nostr, and Mina Protocol.
4. **Zero KYC & Privacy First:** No emails, phone numbers, or government IDs. User identity is managed exclusively via cryptographically generated keypairs stored locally.
5. **YAML-Configurable & White-Label:** Fully modular configuration driven by **YAML files** to allow flexible white-label styling, parameter tuning, fee structuring, and optional cash-in/out module toggles.
6. **Behavior-Driven Development (BDD):** Rigorous testing requirements enforced via BDD frameworks (e.g., Cucumber/Gherkin) covering smart contract rules, user flows, oracle dispute mechanisms, and cashier state transitions.
7. **Dual-UX Architecture (Newbies vs. Power Players):** Designed to bridge the cognitive gap for prediction market newcomers while offering high-density data, advanced liquidity pools, and power-user views for experienced traders.

---

## 3. Technical Component Architecture & Trade-Off Analysis

| Subsystem | Selected Component | Evaluation & Rationale |
| :--- | :--- | :--- |
| **Configuration Engine** | **YAML (`js-yaml` / Python PyYAML)** | Clean, human-readable configuration files (`config.yaml`) for deployers to manage branding, fees, Cashier toggles, and network relays. |
| **Frontend Delivery** | **React + Vite + Tailwind CSS (PWA)** | Responsive UI optimized for mobile viewports (375px–430px) with service workers for offline asset caching. |
| **Onboarding & Auth** | **Zero-App Web Cryptography (`localStorage`/`IndexedDB`)** | Instantly generates client-side Nostr keypairs seamlessly on first visit. Employs a **Progressive Disclosure** model: new players get a guided onboarding tooltip overlay; power players can import/export their `nsec` keys manually. |
| **Real-time Sync & Events** | **Nostr Relays (`nostr-tools`)** | High-throughput pub/sub layer for real-time market creation, odds calculation, betting events, oracle reputation signals, and P2P Cashier order discovery. |
| **Static Metadata Storage** | **IPFS / Filecoin** | Immutable storage for market descriptions, outcome arrays, and resolution rules referenced via CIDs. |
| **Ledger & Settlement** | **Mina Protocol (`o1js` zkApp)** | Provable state updates and settlement mechanics, ensuring zero-knowledge verification of balances, cashier escrow locks, and mandatory administrator fee redirection. |
| **Testing Framework** | **BDD (Cucumber / Gherkin syntax)** | Acceptance tests defined in human-readable feature files to guarantee business logic compliance across smart contracts, cashier escrow flows, and frontend workflows. |

---

## 4. Dual-UX Usability Strategy (Newbies vs. Experts)

To ensure the framework appeals equally to individuals encountering prediction markets for the first time and seasoned veterans, the interface adopts a **progressive disclosure** UX pattern:

* **Newbie Mode (Simple View by Default):**
  * **Plain-Language Explanations:** Markets frame questions intuitively (e.g., "Will X happen by Friday?" with clear green/red probabilistic odds like `72% chance`).
  * **Interactive Onboarding Wizard:** First-time visitors receive an automated 3-step interactive tour explaining VILCOIN as a risk-free reputation game, how odds shift, and how to place their first prediction.
  * **Simplified Betting:** One-tap betting interface showing potential payout percentages and straightforward risk/reward calculations without complex AMM formulas cluttering the screen.
* **Expert Mode (Advanced View Toggle):**
  * **Deep Analytics:** Displays historical probability charts, order books, volume liquidity metrics, and LMSR curve slopes.
  * **Oracle Reputation Metrics:** Advanced filters to inspect oracle historical accuracy, dispute history, and stake weights.
  * **Key Management Pro Tools:** Direct access to manual Nostr key export (`nsec`), custom relay management, Cashier Escrow telemetry, and raw event inspectors.

---

## 5. Detailed Functional Requirements

### 5.1 YAML-Based White-Label Configuration (`config.yaml`)
The platform reads a root configuration file governing global behavior, visual identity, and optional fiat/crypto trading modules:

```yaml
app:
  name: "Villmond Markets"
  logo_url: "/assets/logo.svg"
  theme: "dark" # or light

economy:
  token_name: "VILCOIN"
  initial_user_balance: 1000
  admin_fee_percentage: 2.5
  admin_public_key: "npub1..."
  enable_cashier_network: false # Optional flag to enable P2P fiat/crypto ramps

cashier_module:
  escrow_timeout_blocks: 150
  supported_currencies: ["USD", "EUR", "ZEC", "CASH_P2P"] # Cash P2P, Zcash, Fiat
  min_cashier_stake: 5000 # Minimum VILCOIN lock required to act as cashier
  enable_physical_p2p: true # Enables location-gated cash in-person discovery

network:
  default_relays:
    - "wss://relay.damus.io"
    - "wss://nos.lol"

oracles:
  min_reputation_threshold: 3.0
  require_stake: false
```

### 5.2 Seamless Zero-App Onboarding
* **Instant Key Generation:** When a user opens the web app URL for the first time, the client silently generates a secure cryptographic Nostr keypair (`nsec` / `npub`) and saves it securely to browser storage (`IndexedDB`).
* **Zero Friction:** No app store download, no browser extension installation, no password creation step.
* **Optional Account Backup:** A non-intrusive banner reminds users to save their backup key phrase or private key if they wish to access their VILCOIN balance across different mobile devices.

### 5.3 Market Creation & Flexible Outcomes
* **Outcome Types:** Support for binary (Yes/No) and multi-choice outcome options.
* **IPFS Anchoring:** Market parameters are pinned to IPFS and broadcast over Nostr.
* **AMM Execution:** Liquidity calculations run locally and are verified via Mina zkApps.

### 5.4 Decentralized Oracle & Reputation System
* **Oracle Designation:** Specific public keys are designated as Oracles via configuration or community consensus.
* **Reputation Tracking:** Users publish ratings and reviews over Nostr (`kind: 1985` or custom schema) targeting oracle public keys. The client computes an aggregated reliability score.

### 5.5 ZK-Enforced Protocol Fee Architecture
* **Automated Deduction:** Upon market resolution, the Mina `o1js` smart contract calculates the total VILCOIN pool.
* **Mandatory Redirection:** The configured percentage (`admin_fee_percentage`) is programmatically routed to `admin_public_key`.
* **ZK Integrity:** Hardcoded state transition checks prevent tampering by creators or oracles.

---

## 6. Cashier Exchange Network & In-Person Cash Settlement

In jurisdictions where peer-to-peer virtual credit transfers or predictive trading are legally allowed, activating `enable_cashier_network: true` enables a fully decentralized P2P trading engine.

To **minimize reliance on centralized banking APIs and fiat endpoints** (which are vulnerable to censorship, account freezes, and endpoint blocking), the framework supports **Physical In-Person P2P Cash Exchanges**:

```
                    ┌──────────────────────────────────────────────┐
                    │          Mobile PWA Browser (Client)          │
                    └──────┬────────────────────────────────┬──────┘
                           │                                │
            1. Geohash     │                                │ 4. Cryptographic Proof
               P2P Quote   ▼                                ▼    Release
                    ┌───────────────┐              ┌────────────────────┐
                    │ Nostr Relays  │              │ Mina Protocol      │
                    │  (P2P Desk)   │              │ (`o1js` zkApp)     │
                    └──────┬────────┘              └────────┬───────────┘
                           │ 2. Match                       │ 3. Lock VILCOIN
                           ▼                                │    in ZK Escrow
                    ┌───────────────┐                       │
                    │ Cashier Node  │───────────────────────┘
                    └───────┬───────┘
                            │
                            │ 5. Physical Cash Handover (Person-to-Person)
                            │    or Privacy Crypto (Zcash Shielded ZEC)
                            ▼
                    ┌───────────────┐
                    │ Standard User │
                    └───────────────┘
```

### 6.1 Architectural Mechanics of Person-to-Person Cashiers
1. **Physical Geohash Broadcasts:** Cashiers publish buy/sell availability over encrypted Nostr channels using coarse, privacy-preserving geohashes (fuzzy location radii) to signal local cash availability.
2. **ZK Escrow Protection:** When a trade initiates, the Cashier's VILCOIN is locked into the `CashierEscrow.ts` Mina zkApp contract.
3. **In-Person Handover:**
   * **In-Person Cash:** User and Cashier meet in a physical location. Once cash is handed over, the Cashier uses an ephemeral one-time QR code to sign the ZK release, crediting VILCOIN to the user's wallet instantly.
   * **Privacy Crypto (Zcash):** Payments can be made via shielded Zcash (`z-address`), providing financial privacy without bank endpoint exposure.
4. **Zero-Endpoint Footprint:** No centralized payment gateway, bank wire interface, or corporate entity is required to mediate the exchange.

---

## 7. Open Source Licensing & Developer Exposure Minimization

To insulate core open-source developers from regulatory liability, legal friction, or operational prosecution across jurisdictions:

### 7.1 License Selection: AGPLv3 + Comprehensive Legal Disclaimer

The core framework (`villmond-prediction-markets-poc`) is released under the **GNU Affero General Public License v3.0 (AGPLv3)** accompanied by an explicit **Software-As-Is & Non-Affiliation Exemption Clause**:

1. **Strictly Source-Available Mechanics:** AGPLv3 ensures that any white-label deployer modifying or hosting the framework must publish their modifications back to the open-source community, preventing closed-source proprietary forks.
2. **Dual-Layer Liability Shield:**
   * **No Control or Custody:** The repository contains purely mathematical algorithms, front-end PWA code, and smart contract blueprints. Developers do not host instances, hold private keys, manage oracles, or process user transactions.
   * **Strict Non-Financial Disclaimer:** The code is explicitly designated as open-source educational software. Developers accept no liability for third-party deployments, financial losses, or jurisdiction-specific legal violations by independent operators.

---

## 8. Development Roadmap (Incremental Milestone Plan)

The project is structured into 4 incremental phases to allow early functional evaluation and rapid testing:

```
  Phase 1 (W1-W2)         Phase 2 (W3-W4)         Phase 3 (W5-W6)         Phase 4 (W7-W8)
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Core Engine &  │ ──► │ ZK Smart Contracts│ ──► │  Mobile PWA &   │ ──► │ P2P Cashier &   │
│  YAML / Nostr   │     │  & BDD Testing  │     │   Dual-UX UI    │     │ In-Person Engine│
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Phase 1: Core Protocol & Event Architecture (Weeks 1–2)
* Setup monorepo structure and root `config.yaml` parser.
* Implement Nostr event utilities for user keypair generation (`nsec`/`npub`), market creation (`kind: 30000`), and bet placements.
* Implement IPFS client wrapper for pinning static market metadata.

### Phase 2: ZK Smart Contracts & BDD Test Suite (Weeks 3–4)
* Develop Mina Protocol `VilcoinLedger.ts` and `MarketSettlement.ts` zkApps using `o1js`.
* Hardcode the ZK-enforced administrator fee redirection logic.
* Implement the Cucumber/Gherkin BDD test suite (`/features`) verifying onboarding, settlement, and oracle rating rules.

### Phase 3: Mobile PWA & Dual-UX Interface (Weeks 5–6)
* Develop the React/Vite PWA with Tailwind CSS, optimized for mobile screens (375px–430px).
* Implement instant zero-app onboarding (cryptographic keys in `IndexedDB`).
* Build the Dual-UX interface: **Newbie Mode** (simple odds, guided onboarding wizard) and **Expert Mode** (deep analytics, raw Nostr logs).

### Phase 4: P2P Cashier Network & Hardening (Weeks 7–8)
* Implement `CashierEscrow.ts` zkApp for collateral locks and dispute resolution.
* Build P2P Cashier discovery via Nostr (`kind: 30078`), supporting local physical cash and shielded Zcash (`z-address`) trading options.
* Conduct threat model validation, security audits, and release Version 1.0 under AGPLv3.

---

## 9. Threat Modeling & Risk Matrix: Anonymity, Resilience, Anti-Censorship & Legal

### 9.1 Risk Matrix Summary

| Threat Category | Identifier | Specific Threat / Vulnerability | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Anonymity & Privacy** | **TECH-01** | Browser Fingerprinting & IP Leaks | High | Client-side relay queries utilize randomized WebSocket connections; zero third-party telemetry; optional integration of WebRTC/Tor transport proxies where supported. |
| **Anonymity & Privacy** | **TECH-02** | On-Chain Linkability (Mina Ledger) | Medium | Mina state transitions use zero-knowledge proofs. For cashier trades, users rotate Nostr keypairs for each P2P settlement transaction. |
| **Resilience** | **RES-01** | Nostr Relay Censorship & Eclipse Attacks | High | Multi-relay fallback list configured in `config.yaml`; client automatically broadcasts to 5+ geographic relays and supports self-hosted local relay configurations. |
| **Resilience** | **RES-02** | IPFS Gateway Pinning Failure | Medium | Multi-gateway racing strategy in PWA client; static assets cached via Service Worker IndexedDB. |
| **Anti-Censorship** | **CENS-01** | Domain / DNS Takedowns of PWA | High | PWA static bundle deployed to immutable IPFS/Arweave paths and accessible via decentralized DNS (ENS / Unstoppable Domains) and local IPFS nodes. |
| **Functional & Economic**| **FUNC-01** | Cashier Exit Fraud / Escrow Lockup | High | Over-collateralized Cashier bonding in ZK escrow (e.g., 150% VILCOIN stake); automatic timeout slashers; oracle dispute arbitration. |
| **Functional & Economic**| **FUNC-02** | Oracle Collusion / False Settlement | High | Oracle reliability scoring driven by user reviews; multi-oracle threshold aggregation (M-of-N signatures required for resolution). |
| **Legal & Regulatory** | **LEG-01** | Reclassification as Unlicensed Money Transmitter | Critical | Default core code remains strictly closed-loop with zero monetization. Cashier module is disabled by default via `config.yaml` and isolated as an open-source peer-to-peer extension. AGPLv3 licensing protects core developers. |
| **Legal & Regulatory** | **LEG-02** | Illegal Gambling / Unregulated Binary Options | Critical | White-label operators configure jurisdiction-specific market category filters; zero central operator collecting house commissions (protocol fees go to autonomous zkApp admin pool). |

---

## 10. Monorepo Structure

```text
villmond-prediction-markets-poc/
├── LICENSE                   # GNU AGPLv3 + Legal Disclaimer Exemption Clause
├── config.yaml               # White-label global YAML configuration (Includes Cashier toggles)
├── client/                   # Mobile-first React/Vite PWA frontend
│   ├── src/
│   │   ├── components/       # Dual-UX components & Cashier P2P desk UI
│   │   ├── hooks/            # Nostr, Mina & Cashier Escrow hooks
│   │   └── utils/            # YAML parser, AMM scoring rules, IPFS helpers
│   ├── public/               # PWA manifest.json & service worker
│   └── tailwind.config.js
├── nostr/                    # Nostr event handlers & sync utilities
│   ├── keypair.ts            # Zero-app browser key generation & storage
│   ├── marketEvents.ts       # Market creation & bet broadcasting
│   ├── oracleReputation.ts   # Oracle flagging & user rating streams
│   └── cashierOrders.ts      # P2P cashier liquidity quotes & geohash location discovery
├── contracts/                # Mina Protocol zkApp (o1js)
│   ├── src/
│   │   ├── VilcoinLedger.ts  # ZK circuit for balances & AMM pool logic
│   │   ├── MarketSettlement.ts # Resolution logic + Admin Fee cut enforcement
│   │   └── CashierEscrow.ts  # ZK-enforced collateral bonding & escrow release
│   └── tests/
├── features/                 # BBD Test Suite (Cucumber / Gherkin)
│   ├── onboarding.feature
│   ├── market_settlement.feature
│   ├── oracle_ranking.feature
│   └── cashier_escrow.feature
└── README.md                 # White-label setup, Roadmap, AGPLv3 License, and BBD instructions
```

---

## 11. Step-by-Step Implementation Prompt for Agentic AI

When handing this complete specification over to an autonomous coding agent, execute the following prompt:

```text
You are an expert full-stack Web3 engineer specializing in zero-knowledge circuits, Nostr protocols, AGPLv3 software licensing, BDD test suites, and mobile-first Progressive Web Apps. Build the complete Proof of Concept (POC) repository named "villmond-prediction-markets-poc" (Version 1.0) according to the following specifications:

1. Licensing & Repository Setup:
   - Include an AGPLv3 LICENSE file with explicit liability disclaimer clauses protecting core software developers.
   - Implement a root `config.yaml` parser handling white-label settings: branding names, starting VILCOIN balance (default: 1000), admin fee percentage (default: 2.5%), admin public key, default Nostr relays, and an `enable_cashier_network` boolean flag.

2. Zero-App Onboarding & Dual-UX Frontend (`/client`):
   - Build a responsive PWA using React, Vite, and Tailwind CSS optimized for mobile viewports (375px–430px).
   - Implement instant client-side key generation on first load without requiring any third-party app installation or browser extensions.
   - Design a Dual-UX toggle supporting a guided "Newbie Mode" (simplified probabilistic odds, onboarding wizard) and an "Expert Mode" (advanced liquidity metrics, analytics charts, manual key management, Cashier P2P Geohash Desk).

3. Mina zkApp Smart Contracts (`/contracts`):
   - Using o1js, implement `MarketSettlement.ts` ensuring the ZK circuit programmatically calculates and routes the configured admin fee percentage to the admin address upon resolution.
   - Implement `CashierEscrow.ts` handling collateral bonding, VILCOIN lockups, and P2P in-person cash / Zcash settlement release proofs.

4. BDD Test Suite (`/features`):
   - Write Cucumber/Gherkin feature files (`onboarding.feature`, `market_settlement.feature`, `oracle_ranking.feature`, `cashier_escrow.feature`) and step definitions validating contract invariants, fee cuts, and cashier escrow workflows.

Output clean, modular TypeScript code with complete feature test coverage, incremental roadmap notes, and clear setup instructions in README.md.
```