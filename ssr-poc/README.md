# SSR prototype

Validates whether RouteVN Creator can paint real UI on first render and then
hydrate. Nothing here is wired into the product build — `_site` is never
written to, and variant assets are symlinks into the real build output.

## Run

```bash
bun run build:web            # produces _site/public/* which the POC symlinks

node ssr-poc/build.js        # render in Node, emit variants to ssr-poc/out/
node ssr-poc/measure.js      # Chromium: paint metrics + hydration telemetry
```

Variants D and E need a framework-patched bundle (built once):

```bash
node ssr-poc/hydration/apply.js on
node_modules/.bin/rtgl fe build -s src/setup.web.js -o ssr-poc/hydration/build/main.js
node ssr-poc/hydration/apply.js off      # ALWAYS revert; restores node_modules
```

`apply.js` backs up the file it edits and `off` restores it exactly.

## Variants

| | markup | hydration |
|---|---|---|
| `a_baseline` | empty `<rvn-app>` — what ships today | n/a |
| `b_lightdom` | server tree as light-DOM children | none; markup self-erases on upgrade |
| `c_dsd` | one declarative shadow root on `rvn-app` | none — **broken**, client appends beside server tree |
| `d_dsd_hydrate` | same as C | root only; nested components re-render |
| `e_nested_dsd` | a declarative shadow root per fe component | per-component adoption |

## Results (Chromium, 4× CPU throttle, 1440×900)

```
variant        FP      FCP      pre-JS UI   render target   hydration
a_baseline     132ms   1676ms   blank       clean           -
b_lightdom      76ms    136ms   PAINTED     clean           -
c_dsd           76ms    116ms   PAINTED     +2 STALE        -
d_dsd_hydrate   76ms    112ms   PAINTED     clean           h=1 m=0
e_nested_dsd    80ms    120ms   PAINTED     clean           h=5 m=0
```

## The decisive finding: registration order, not prop serialization

`e_nested_dsd` first measured `h=4 m=1`. The single mismatch was NOT a transport
problem — object props are never serialized and never need to be. It was
ORDER: `frontendEntrySource.js:196` sorts categories alphabetically, so
`components` register before `pages`. In this app the pages are the parents, so
children were upgrading and running their first render before any parent had
assigned their props.

Defining parents before children takes it to `h=5 m=0` with **zero markup
changes**. Props reach the child as plain own properties on the element, set by
snabbdom's `propsModule` while the child's tag is still undefined;
`installReactiveProps` (`props.js:107-120`) captures those pre-set own
properties on upgrade and preserves them. Nothing is stringified, so objects,
arrays and functions all survive intact.

The experiment used `.sort().reverse()`, which works here only because "pages"
happens to sort after "components". The real fix is a topological sort of the
tag-reference graph, which the codegen can derive since it already parses every
view. Cycles need a `defer-hydration` fallback.

Booted screenshots for `a`, `b`, `d`, `e` are byte-identical — all converge on
the correct UI. `c` does not, and is visibly corrupted.

## Tests

```bash
npx vitest run ssr-poc/tests/          # 37 fast tests, ~1.4s, no browser
node ssr-poc/tests/hydration-parity.mjs # 8 end-to-end checks in real Chromium
```

`serialize.test.js` (20) — escaping, raw-text elements, boolean attributes,
props never emitted, class/style merging, void elements.

`invariants.test.js` (12) — the consistency guarantees:
- byte-identical output across repeated renders, and under a shifted `Date.now`
- every store imports and runs in bare Node with no DOM
- no `Math.random`/`Date.now` in any `selectViewData`
- unique component names, zero render failures, balanced tags
- every host marked for hydration, one render target per shadow root, no
  `[object Object]` anywhere

`ssr-hazards.test.js` (5) — static scan for browser globals in the
first-render path, with an allowlist. This catches what execution tests
cannot: `globalThis.window?.innerWidth ?? FALLBACK` does not throw in Node, it
silently returns a different value than the client. Guarded browser access is
more dangerous than unguarded. Two real offenders found: `vnPreview` and
`mobileSidebar`.

`hydration-parity.mjs` — the only test that proves the invariant end to end,
because a mismatch is not an error: it silently re-renders and still looks
correct. Gates on `mismatched === 0`, server DOM adopted rather than replaced,
no stray templates, no console errors. **This is the CI gate.** Without it SSR
quietly stops paying for itself and nobody notices.

## Using it from a backend

```bash
node ssr-poc/server/server.js
curl -s localhost:3500/projects/
```

`server/renderPage.js` is the seam (would live in `@rettangoli/fe/server`);
`server/server.js` is the whole application integration. Measured: **~12ms warm
per request** (min 10.3, max 17.3 over 8 requests), 7.7KB out, 5 components.

## What the pieces are

- `lib/serialize.js` — vnode → HTML. Replaces `snabbdom-to-html`, which
  stringifies `data.props` into lowercased attributes (emitting both `h-bc` and
  `hbc` on the same element) and drops empty-string attributes, which is exactly
  how rettangoli encodes booleans.
- `lib/render.js` — recursive component renderer. Resolves tag → component via
  `*.schema.yaml`, runs `createInitialState` + `selectViewData`, calls
  `parseView`, recurses. Handlers are never run.
- `hydration/hydrationVNode.js` — builds a snabbdom "old vnode" from server DOM
  so the first patch adopts instead of appends. Bails to `null` on any
  structural mismatch, so a divergence degrades to CSR rather than corrupting.
- `hydration/apply.js` — reversibly patches the app's `@rettangoli/fe` runtime.

## Known limitation reproduced

`e_nested_dsd` reports `mismatched=1` on `rtgl-form`: `child count 2 != 1`.
Cause is `:defaultValues=${obj}` / `:form=${obj}` — property-form bindings have
no HTML representation, so the server and client compute different `viewData`
for that subtree. The fallback caught it and rendered correctly. This is the
general case for the ~1,499 `:prop=` bindings in the app and is the thing a real
implementation has to solve (a serialized prop channel, or restricting SSR to
components whose props are string/boolean).
