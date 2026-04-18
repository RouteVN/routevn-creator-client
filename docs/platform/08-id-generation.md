# 08 ID Generation

Date baseline: April 16, 2026.

This document defines the current ID-generation contract for RouteVN Creator.

## Source Of Truth

Production runtime IDs must be generated through
`src/internal/id.js`.

Current exported helpers:

- `generateId(length?)`
- `generatePrefixedId(prefix, length?)`
- `getIdGenerator(length?)`

Current shared contract:

- alphabet: base58
- default length: `12`
- direct `nanoid()`, `crypto.randomUUID()`, `Math.random()`, or timestamp-based
  ID generation must not be added in production code outside the shared helper

Tests may still inject deterministic generators when exact IDs matter for
assertions.

## Why Base58

Base58 gives us IDs that are:

- URL-safe without extra encoding
- alphanumeric-friendly for downstream runtime contracts
- shorter and easier to read than UUIDs
- less ambiguous for humans than alphabets containing `0`, `O`, `I`, or `l`

## Default Rule

Use `generateId()` for any normal identifier unless there is an explicit
reason to do something else.

This is the default for:

- persisted project ids
- persisted namespaces
- repository/entity ids such as resource ids, layout element ids, section ids,
  and line ids
- command ids
- internal IDs that do not need a readable prefix

If a new identifier does not have a special external contract, use
`generateId()` and keep the default length of `12`.

## Approved Length Rules

Do not pick random lengths ad hoc. A non-default length needs an explicit
reason.

Currently approved lengths:

- `12`
  - default for almost all production identifiers
  - use `generateId()`
  - also acceptable for standard generated suffixes inside a larger composite
    identifier when the code wants to make that contract explicit

If a new use case needs a different length, document the reason in this file in
the same PR.

## Approved Prefix And Composite Rules

Use `generatePrefixedId(prefix)` or manual composition around `generateId(...)`
only when one of these is true:

- the existing format already includes a stable readable prefix
- the value is temporary UI-local state where debugging/readability matters
- the surrounding protocol/debug identifier already contributes structure, so
  the generated part is only one suffix of the full value

Current approved prefixed or composite shapes:

- `scene-<base58>`
  - existing scene-creation flow currently emits this shape
  - preserve it unless we intentionally migrate scene ids repo-wide
- `visual-<base58>`
  - UI-local visual selection/state ids
- `pending-...-<base58>`
  - temporary pending upload and placeholder ids
- `local-<base58>`
  - local collab actor client ids
- `web-<projectPart>-<base58>`
  - web collab debug client ids

Default rule:

- do not add new readable prefixes to normal persisted domain ids unless there
  is a compatibility or protocol reason

## Generator Injection Rule

Some services accept an `idGenerator` callback instead of directly importing the
helper.

Use these rules:

- production service wiring should pass the centralized generator
- use `generateId` for the normal default contract
- use `getIdGenerator(length)` only when a non-default reusable generator
  function is actually needed
- tests may inject deterministic generators for stable assertions

This keeps production format centralized while still allowing precise test
control.

## Anti-Rules

Do not do these in production code:

- import `nanoid` directly in feature/service/page code
- call `crypto.randomUUID()` directly for app IDs
- build IDs from `Date.now()` plus `Math.random()`
- invent a new prefix or a new default length locally

If one of those seems necessary, update this document and the shared helper in
the same PR instead of creating a one-off generator.
