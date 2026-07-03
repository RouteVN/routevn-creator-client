# Iteration 10 - Instrumentation Plan

## Question

What measurements will prove which lane dominates real Android lag?

## Evidence

- Repo guidance says not to add browser-global debug toggles and says temporary diagnostics should log directly while present at `docs/engineering.md:77`.
- Existing `debugLog` is controlled by browser-global flags such as `window.__RVN_DEBUG_*` at `src/deps/services/shared/debugLog.js:3` through `:19`.
- The Android navigation timing pattern uses direct structured `console.info` logs with a stable prefix at `src/internal/navigationTiming.js:73`.
- Navigation timing supports trace ids and delta/total timing at `src/internal/navigationTiming.js:132` through `:147`.
- Android bridge calls already record duration boundaries via `getNavigationTimingNow` at `src/deps/clients/android/bridge.js:26`.

## Finding

For this issue, temporary direct timing logs are better than the existing `debugLog` flag mechanism. We need reliable output on Android debug builds without asking the user to set browser-global flags.

The logs must not include dialogue text or raw project data. They should include only:

- trace id,
- event name,
- phase name,
- duration,
- section/line ids,
- line counts,
- section counts,
- changed counts,
- booleans such as `isComposing`, `skipRender`, `syncPresentationState`,
- queue/debounce delay.

## Proposed Measurement Boundaries

1. Primitive input/update:
   - `beforeinput` input type and composition state.
   - `syncFromEditorState`: snapshot duration, line count, changed line count, clone/diff duration, dispatch duration.
   - `renderGutters`: line count, layout read count, preview row count, DOM replacement count, second-render flag.

2. Page edit handler:
   - `handleEditorDataChanged`: reason, section id, incoming line count, draft replacement duration, selection changed flag, page render duration, canvas dispatch flag.

3. Selector/render:
   - `selectViewData`: section count, total line count, selected line count, decorations duration, graph duration, presentation selection duration.

4. Runtime/canvas:
   - Keep existing phase boundaries, but log even when the event came from text input: project-data projection, selected-entry clone, engine init, render-state select, section-change extraction, UI render.

5. Keyboard:
   - keyboard geometry event type, events per second, rounded metric changes, toolbar render duration, parent render duration.

6. Draft flush:
   - queued delay, pending section count, snapshot clone duration, `syncSectionLinesSnapshot` duration, project-state sync duration, equality/rebase duration, final render duration.

## Success Criteria

The first instrumentation pass should answer:

- Is keystroke lag dominated by primitive snapshot/diff, page render, route-runtime sync, gutter layout, keyboard resize, or autosave?
- Does composition generate more update events per visible character?
- Does lag correlate with section line count, scene line count, project size, section count, or keyboard event bursts?
- Are there periodic stalls at autosave intervals?

## Optimization Hypothesis

Do not start with broad refactors. Add measurement first, then disable/gate one expensive lane at a time and compare Android timing.

## Confidence

High. The boundaries align with the code paths already identified.

## Next Question

What validation will keep a performance refactor from breaking editor correctness?
