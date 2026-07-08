# Roadmap Status

Last reviewed: 2026-07-08.

This document is the current maintainer-level roadmap summary. Older feature
plans remain useful for implementation details, but some of them describe work
that has already moved forward in code.

## Current Baseline

- Desktop/Tauri remains the production desktop shell.
- Android has a native WebView shell with local SQLite, files, picker, and
  local project storage adapters.
- iOS has a native WKWebView shell with local SQLite, files, picker, streamed
  ZIP export, and local project import/export adapters.
- Insieme 2.1 hard cutover is complete.
- Export bundle v4, reachability filtering, whole-file dedupe, and diced-image
  runtime parsing are implemented. Remaining export work is mainly regression
  coverage and startup-cost monitoring.
- Resource tags and animation transition masks have implementation in the
  client. Their older plan docs should be treated as audit checklists before
  further feature work, not as unstarted roadmaps.

## Current Priority

### 1. Simulator-Only Mobile Hardening

Until a physical iPhone or iPad is available, keep hardening iOS through:

- Node adapter tests for iOS bridge-facing clients and services
- iOS Simulator smoke tests
- ZIP integrity checks for simulator exports
- mobile viewport and safe-area visual checks where simulator behavior is
  representative

Do not claim full iOS device readiness from simulator-only validation. The
simulator cannot prove Files-provider security-scope behavior, iCloud Drive
provider quirks, physical keyboard/touch edge cases, or signing/install flows.

### 2. Roadmap And Spec Reconciliation

Before starting another large feature, reconcile these docs against the current
code:

- `docs/resource-tags-spec.md`
- `docs/animation-editor-transition-mask-plan.md`
- `docs/export-bundle-size-reduction-plan.md`

The outcome should be either an updated done/remaining checklist or a short
replacement status doc for each area.

### 3. Compatibility Policy

Do not start project/model compatibility work by changing validators. First
write and agree on the policy questions in
`docs/platform/10-model-compatibility-and-upgrades.md`:

- supported single-user upgrade contract
- supported mixed-version collaboration contract
- authoritative project-open version field
- read-only versus refused behavior for incompatible collaborative clients

## Later Work

- Physical iOS/iPadOS validation and release signing flow.
- TestFlight/App Store automation after signing decisions are made.
- Import packages MVP once compatibility and package trust policy are clear.
- Layout editor refactor, starting with shared conditions.
- Observability implementation for local logs and explicit error capture.
