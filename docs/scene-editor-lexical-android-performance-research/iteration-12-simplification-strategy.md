# Iteration 12 - Simplification Strategy

## Question

What is the simplest architecture that can make older Android typing performant without rewriting the editor from scratch?

## Current Coupling

Plain text input currently crosses too many boundaries:

1. Lexical local editor update.
2. Full-section snapshot and diff.
3. Page draft replacement.
4. Page render.
5. All-section editor prop rebuild.
6. Gutter layout across lines.
7. Runtime/canvas projection.
8. Section-change recomputation.
9. Draft autosave.
10. Keyboard/viewport render churn on mobile.

## Target Architecture

Split the scene editor into four lanes:

### 1. Hot Input Lane

Scope: Lexical DOM, local selected line, local dirty flags.

Rules:

- No page render for each character.
- No route-engine work for each character.
- No all-section derived data for each character.
- No full-section snapshot during composition.
- Track dirty line ids or dirty section version locally.

### 2. Draft Persistence Lane

Scope: debounced save and repository sync.

Rules:

- Full snapshot is allowed on debounce/blur/composition end, not every input update.
- Prefer dirty-line/range save later if measurement proves autosave stalls.
- Save correctness has priority over micro-optimizing the first pass.

### 3. Preview Runtime Lane

Scope: canvas, route engine, section line changes, presentation state.

Rules:

- Run for action/presentation/selection/structure changes.
- Do not run for every dialogue character unless product explicitly requires live preview text per keystroke.
- If live text preview is required, use a narrow debounced current-line text update instead of full project projection.

### 4. UI Chrome Lane

Scope: section headers, system actions, keyboard toolbar, graph view, settings/forms.

Rules:

- Keyboard geometry changes update inset/layout state only.
- Section graph data is built only when graph view is active.
- Inactive mobile sections are lightweight; only active/visible section owns a full Lexical editor.
- System actions update when selected line/actions/presentation changes, not on plain dialogue text.

## Phased Plan

### Phase 0 - Instrument

Add temporary timing logs and gather Android traces. No behavior changes.

### Phase 1 - Gate Obvious Global Work

- Stop dispatching full runtime/canvas sync for plain text edits.
- Stop page rendering for text edits when selection/action chrome did not change.
- Avoid graph JSON when graph view is closed.
- Avoid duplicate parent render for keyboard state changes where metrics did not materially change.

Expected impact: large, low-to-medium risk.

### Phase 2 - Reduce Mounted Work

- On mobile, mount only the active section editor or active plus nearest neighbors.
- Render inactive sections as section headers/summary rows.
- Preserve cross-section navigation through explicit section switching.

Expected impact: large on projects with many sections, medium risk.

### Phase 3 - Dirty-Line Editor Model

- Track changed line ids in the primitive.
- Dispatch lightweight edit metadata during typing.
- Take full snapshots on debounce/blur/structure/composition-end.
- Make gutter render dirty-line aware.

Expected impact: large on long sections, medium-to-high risk.

### Phase 4 - Projection Caching

- Cache resource projection by repository revision.
- Cache section decorations by section/change/repository revision.
- Index section line changes by line id.
- Cache section presentation summaries by action/topology version.

Expected impact: medium-to-large on big projects, medium risk.

## Recommended First Implementation

After instrumentation, the first real change should be:

1. Gate `sceneEditor.renderCanvas` for `changeReason === "text"` unless a presentation-affecting part changed.
2. Skip page `render()` in `handleEditorDataChanged` when only dialogue text changed and selected line/section did not change.
3. Defer full primitive snapshot/page sync during IME composition.
4. Gate `sectionsGraph` computation behind `sectionsGraphView`.

This is the best cost/risk ratio because it removes global work before touching the most fragile Lexical internals.

## Confidence

High that this is the right direction. Medium on exact ordering until Android traces prove the largest measured lane.

## Next Question

What do all iterations imply as the final prioritized action plan?
