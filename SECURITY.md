# Security Policy

`villmond-prediction-markets-poc` is open-source educational software (see
[LICENSE](./LICENSE)'s Software-As-Is & Non-Affiliation clause). No
maintainer of this repository operates, hosts, or custodies any deployed
instance — but we still want to know about flaws in the code itself.

## Automated scanning

This repository runs the following automated checks on every push/PR to
`main`, and weekly on a schedule:

- **[CodeQL](./.github/workflows/codeql.yml)** — static analysis (SAST) for
  JavaScript/TypeScript.
- **`npm audit`** (`.github/workflows/ci.yml`) — dependency vulnerability
  scanning, failing the build on moderate-or-higher severity findings.
- **[Dependabot](./.github/dependabot.yml)** — weekly automated dependency
  and GitHub Actions update PRs, plus Dependabot security alerts.

## Reporting a vulnerability

If you find a security issue in this codebase (for example, in the zkApp
contracts under `contracts/src/`, the signature-verification logic in
`nostr/src/`, or the client's key-handling code), please open a private
report via **GitHub Security Advisories**
(`Security` tab → `Report a vulnerability`) rather than a public issue, so a
fix can land before the details are public.

Please include:

- The affected file(s) and a concrete reproduction (a failing test is ideal).
- The potential impact — e.g. for a zkApp, whether it is a signature-replay,
  state-transition, or precondition bypass.

## Scope note

This is a Proof of Concept. The PRD's roadmap (section 8, Phase 4) calls for
an external "threat model validation" and "security audit" before a
Version 1.0 release — the automated checks above are a baseline, not a
substitute for that review. See [`README.md`](./README.md) for status.
