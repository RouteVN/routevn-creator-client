# Computed Variables: Version B Requirements

Status: superseded by the Operation builder

> The nested Version B editor described below is retained as design history.
> The current implementation starts with an **Operation** surface: its plus
> menu offers **Add** and a disabled **If** placeholder. An Add block accepts
> multiple numeric Variable, Value, or Operation operands. Because the engine's
> `add` expression is binary, three or more flat operands compile into a
> left-associated `add` chain and reopen as one flat block. An intentionally
> nested Add is kept on the right side of that chain and reopens as a nested
> Operation operand. Authors add a Variable or Value before adding a nested
> Operation so those two structures remain distinguishable without persisting
> editor-only metadata. If is intentionally not implemented yet.

Target: `src/pages/variables`

Engine contract: `route-engine` computed variables, as documented in
`../route-engine/docs/ComputedVariables.md`

## 1. Decision

The computed-variable editor will use Version B from the prototype: a nested,
structured expression editor. Authors build a formula from cards representing a
variable reference, literal value, or engine operation. Each operation owns its
operand cards, so the UI structure maps directly to the engine's recursive JSON
expression tree.

The first implementation must not include:

- an evaluated-value preview;
- current-value, default-value, or test-input controls;
- a formula text language or raw JSON/code editor;
- arbitrary functions, scripts, or custom operators;
- Version C's pipeline editor;
- conversion between stored and computed variables after creation.

Validation is still required. It reports whether the definition is complete and
valid, but it does not display the evaluated result. The engine-schema panel in
the HTML prototype is a design/debug aid and is not a required product surface.

## 2. Goals

The implementation must:

1. Let non-programmers create computed values without editing JSON.
2. Represent every operation and output type supported by the engine.
3. Support both a single formula and ordered conditional results.
4. Preserve the engine AST exactly without introducing a second formula
   language.
5. Prevent invalid configurations where the UI has enough type information to
   do so, and report remaining engine validation errors before save.
6. Make nested formulas understandable, editable, keyboard-accessible, and
   usable in the variables page's responsive layouts.
7. Keep computed values read-only everywhere that stored variables can be
   mutated.

## 3. Canonical variable model

### 3.1 Source versus result type

`computed` is the canonical discriminator. Do not add
`variableType: "computed"`.

- `variableType` remains the result type in Creator data.
- A variable is computed when it has a `computed` property.
- A variable without `computed` is stored.
- `valueSource: "stored" | "computed"` may exist in form or component state,
  but it must not be persisted.
- Creator's existing `type: "variable"` resource discriminator remains
  unchanged.
- Projection continues to map Creator `variableType` to the engine's `type`.

Stored Creator variable:

```json
{
  "type": "variable",
  "variableType": "number",
  "scope": "context",
  "default": 80,
  "value": 80
}
```

Computed Creator variable:

```json
{
  "type": "variable",
  "variableType": "number",
  "computed": {
    "expr": {
      "round": [
        {
          "mul": [
            {
              "div": [{ "var": "variables.hp" }, { "var": "variables.maxHp" }]
            },
            100
          ]
        }
      ]
    }
  }
}
```

### 3.2 Required invariants

- A computed variable must have a non-empty resource ID, `variableType`, and
  `computed`.
- The resource ID `__proto__` is forbidden by the engine.
- The supported result types are exactly `string`, `number`, `boolean`, and
  `object`.
- A computed variable must not persist top-level `default` or `value`.
- A computed variable must not persist `scope`. Creator projects it to the
  engine with a fixed `context` scope because derived values are temporary and
  never participate in scoped persistence.
- `readonly` is not needed; the presence of `computed` provides read-only
  semantics.
- Existing stored variables require no migration.
- For the first release, value source and result type are fixed after creation,
  matching the existing edit behavior that locks type. Editing may change the
  formula, metadata, name, description, and tags.
- A simple computed definition contains exactly one of `computed.expr` or
  `computed.value`.
- A conditional computed definition contains `computed.branches` and
  `computed.default`, and contains neither a sibling `expr` nor `value`.
- Every branch contains `when` and exactly one of `expr` or `value`.
- The explicit default contains exactly one of `expr` or `value`.
- Unknown properties must not be written into engine-facing computed data.

### 3.3 Literal encoding

- New primitive results (`string`, finite `number`, `boolean`, or `null`) use
  `expr` values as the Creator's canonical authoring shape.
- A new whole object or array result uses `value`.
- An object or array used as an expression operand is wrapped in
  `{ "literal": value }` so it cannot be mistaken for an operation.
- When loading existing valid data, the editor must preserve an authored scalar
  `value` or root `{ "literal": value }` wrapper until the author explicitly
  replaces that root node. Opening and saving must not rewrite an equivalent but
  structurally different engine definition.
- Arrays cannot be stored directly as an expression node.
- Numeric literals must be finite. `NaN`, `Infinity`, and `-Infinity` are
  invalid.
- `null` may be used as an intermediate primitive expression, but it cannot be
  saved as the final result because it matches none of the engine result types.

## 4. Variables-page integration

### 4.1 Add and edit dialogs

The variables-page Add button opens a dropdown with **Variable** and
**Computed** choices. The choice is made before opening a dialog; value source
is not a field inside either form.

The stored-variable dialog includes:

- name;
- description and tags, following the existing variable metadata behavior;
- scope;
- stored result type;
- enum and default-value fields where supported.

The current computed-variable dialog includes:

- name;
- description and tags;
- **Result type**, set to Number when Add is selected;
- **Operation**, with a plus menu containing Add and a disabled If option;
- an Add block whose own plus menu adds numeric Variable or Value operands.

Editing opens the matching stored or computed dialog automatically. Value
source remains immutable.

The computed editor should live in a dedicated, wide dialog or a full-screen
dialog at narrow breakpoints. Deep expression trees must not make the rest of
the variable form unusable.

### 4.2 List and detail surfaces

- A computed variable must have a visible `fx`/Computed marker in the list and
  detail panel.
- The type remains its output type, not `computed`.
- The current Default column must not display a fabricated value for computed
  variables. It should become a source/definition-aware column or display a
  localized `Formula`/`Conditional` label for computed rows.
- Conditional rows may include a compact localized branch count such as
  `3 conditions`.
- Search and filtering must be able to distinguish Stored and Computed.
- The read-only detail panel must use `rvn-detail-view` and show metadata,
  result type, value source, computation mode, a human-readable formula
  summary, and direct variable dependencies.
- The list and detail panel must not evaluate or preview the computed result.
- Editing continues to open a dialog; the detail panel must not become an
  inline editor.

## 5. Version B expression editor

### 5.1 Node model

Every expression position is a card with one of these authoring sources:

1. **Variable**: a `variables.*` or `runtime.*` reference.
2. **Value**: a type-aware literal control.
3. **Operation**: a supported engine operator with nested operand cards.

The root card receives the computed variable's required result type. Operand
cards receive an expected type when the selected operator has one. Each card
shows a compact summary when collapsed and a visible output-type badge when the
type is known.

The editor's internal draft may assign stable UI-only IDs to nodes and branches
for focus, reorder, and rendering. Those IDs must be removed when compiling the
engine config.

### 5.2 Variable references

- The picker is searchable and grouped into project Variables and Runtime.
- Project variables include stored and computed variables.
- The variable being edited is excluded from its own picker.
- Each project-variable option shows its result type and computed/stored source.
- Options should be filtered or ranked by the operand's expected type. The UI
  must still be able to display an incompatible reference already present in an
  imported project and explain the error instead of silently replacing it.
- `variables.*` references must point to declared concrete variable IDs.
- `runtime.*` references must point to concrete runtime members supplied by the
  app's runtime-field catalog.
- No other root namespaces and no bare `variables` or `runtime` references are
  allowed.
- Simple IDs serialize with dot syntax (`variables.hp`). IDs containing dots,
  quotes, backslashes, or brackets serialize with correctly escaped quoted
  bracket syntax (`variables["player.stats"]`).
- Nested paths may be selected when supported by the reference catalog. Numeric
  brackets must use canonical indices; string keys with leading zeroes must be
  quoted.

### 5.3 Literal controls

- String: text input or multiline input where appropriate.
- Number: finite-number input with no implicit string coercion.
- Boolean: explicit True/False selection.
- Object: a structured object/array value editor. Raw JSON is not the primary
  authoring interface.
- Null: an explicit intermediate-literal choice only where the expression can
  accept an unknown/any value.
- Literal editors must preserve `0`, `false`, and empty string exactly; defaults
  must use nullish semantics rather than truthy fallbacks.

### 5.4 Card behavior

- Operation operands appear as indented child cards with clear connectors and
  localized operand labels (`Left`, `Right`, `Value`, `Minimum`, etc.).
- Fixed-arity operations always show the exact number of operands.
- Variadic operations provide Add, Remove, and Reorder controls and must retain
  at least one operand.
- Replacing a populated node source or operation must ask for confirmation when
  descendants would be lost.
- Cards may be collapsed, but an invalid descendant must keep its error visible
  in the collapsed summary.
- Add/remove/reorder operations must place focus predictably and support undo
  within the open draft if the shared form infrastructure provides it.
- There is no arbitrary expression-depth limit. The layout must remain usable
  through indentation, collapse, and horizontal overflow prevention.
- The editor must never silently normalize an unsupported imported node into a
  different operation or literal.

## 6. Formula operators

The Operation menu must contain exactly the engine's supported expression
operators. `var` and `literal` are represented by the Variable and Value sources,
not duplicated in the Operation menu.

| Category   | Operator              | Operands | Static output | Required behavior                                                                                |
| ---------- | --------------------- | -------: | ------------- | ------------------------------------------------------------------------------------------------ |
| Arithmetic | Add (`add`)           |        2 | Number        | Both operands must resolve to finite numbers.                                                    |
| Arithmetic | Subtract (`sub`)      |        2 | Number        | Both operands must resolve to finite numbers.                                                    |
| Arithmetic | Multiply (`mul`)      |        2 | Number        | Both operands must resolve to finite numbers.                                                    |
| Arithmetic | Divide (`div`)        |        2 | Number        | Both operands must resolve to finite numbers; a non-finite result fails final number validation. |
| Arithmetic | Modulo (`mod`)        |        2 | Number        | Both operands must resolve to finite numbers; a non-finite result fails final number validation. |
| Arithmetic | Negate (`neg`)        |        1 | Number        | Operand must resolve to a finite number.                                                         |
| Number     | Round (`round`)       |        1 | Number        | Operand must resolve to a finite number.                                                         |
| Number     | Floor (`floor`)       |        1 | Number        | Operand must resolve to a finite number.                                                         |
| Number     | Ceil (`ceil`)         |        1 | Number        | Operand must resolve to a finite number.                                                         |
| Number     | Minimum (`min`)       |        2 | Number        | Both operands must resolve to finite numbers.                                                    |
| Number     | Maximum (`max`)       |        2 | Number        | Both operands must resolve to finite numbers.                                                    |
| Number     | Clamp (`clamp`)       |        3 | Number        | Operand order is Value, Minimum, Maximum.                                                        |
| Compare    | Equal (`eq`)          |        2 | Boolean       | Strict equality; no type coercion.                                                               |
| Compare    | Not equal (`neq`)     |        2 | Boolean       | Strict inequality; no type coercion.                                                             |
| Compare    | Greater than (`gt`)   |        2 | Boolean       | Only two finite numbers or two strings are order-comparable.                                     |
| Compare    | Greater/equal (`gte`) |        2 | Boolean       | Only two finite numbers or two strings are order-comparable.                                     |
| Compare    | Less than (`lt`)      |        2 | Boolean       | Only two finite numbers or two strings are order-comparable.                                     |
| Compare    | Less/equal (`lte`)    |        2 | Boolean       | Only two finite numbers or two strings are order-comparable.                                     |
| Compare    | In (`in`)             |        2 | Boolean       | Operand order is Value, Collection; collection must evaluate to an array to match.               |
| Logical    | And (`and`)           |       1+ | Boolean       | True when every evaluated operand is truthy.                                                     |
| Logical    | Or (`or`)             |       1+ | Boolean       | True when any evaluated operand is truthy.                                                       |
| Logical    | All (`all`)           |       1+ | Boolean       | Alias of `and`; preserve the authored operator.                                                  |
| Logical    | Any (`any`)           |       1+ | Boolean       | Alias of `or`; preserve the authored operator.                                                   |
| Logical    | Not (`not`)           |        1 | Boolean       | Boolean negation of the evaluated operand's truthiness.                                          |
| Collection | Length (`length`)     |        1 | Number        | String/array length or own-key object length; other values resolve to `0`.                       |
| Collection | Includes (`includes`) |        2 | Boolean       | Operand order is Collection, Value; supports strings and arrays with strict matching.            |

Operation choices should be filtered by the result expected at that card. The
editor may use known project-variable types to catch incompatible numeric
operands early. Runtime and nested-object references may have an unknown static
type, so the engine remains the final validator.

Aliases are not automatically rewritten. If a project contains `all`, editing
and saving it must not turn it into `and` unless the author explicitly changes
the operation.

## 7. Conditional mode

### 7.1 Branch structure

- Conditional mode requires at least one ordered branch and one explicit
  default result.
- Branches are evaluated top-to-bottom; the first matching branch wins.
- Each branch has a **When** condition editor and a **Result** Version B
  expression editor.
- The result editor uses the computed variable's declared result type.
- The default result is always last, cannot be deleted, and has no condition.
- Authors can add, delete, duplicate, and reorder non-default branches.
- Reorder must work with buttons/keyboard as well as pointer drag and drop.
- Branch cards show compact condition/result summaries when collapsed.
- Deleting the only branch is forbidden. Deleting a populated branch requires
  the standard destructive confirmation.

### 7.2 Condition grammar

Conditions use the engine's semantic JSON condition grammar, not the computed
expression grammar. The condition editor must support exactly:

| Operator/source     | Shape                               | Arity/behavior                                                              |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Variable            | `{ "var": path }`                   | Reads `variables.*` or `runtime.*`.                                         |
| Literal             | primitive or `{ "literal": value }` | The wrapper is required for object/array literals.                          |
| All                 | `{ "all": [...] }`                  | One or more nested conditions.                                              |
| Any                 | `{ "any": [...] }`                  | One or more nested conditions.                                              |
| Not                 | `{ "not": condition }`              | One direct nested condition; unlike expression `not`, this is not an array. |
| Equal / Not equal   | `eq`, `neq`                         | Exactly two operands; strict comparison.                                    |
| Ordered comparisons | `gt`, `gte`, `lt`, `lte`            | Exactly two operands; only same-kind strings or finite numbers compare.     |
| In                  | `in`                                | Exactly two operands: Needle, Haystack.                                     |
| Add / Subtract      | `add`, `sub`                        | Exactly two numeric operands; useful inside another condition.              |

Condition roots ultimately use the engine's truthiness behavior. The UI should
favor explicit comparison/logical operators for readability, but it must be
able to faithfully load every valid semantic condition shape.

The computed-condition editor must reject:

- string condition expressions;
- function calls (`call`);
- `_event.*` and every root other than `variables` and `runtime`;
- malformed paths or unknown project variables;
- unknown operators and wrong operand counts.

Dependencies in every condition must be collected even when another branch is
currently selected first.

## 8. Validation and error handling

### 8.1 No preview

The first release must not execute a formula to show an author-facing result.
There is no Current result card, evaluated default, test-data form, or branch
match indicator. A successful validation may show only a localized message such
as `Definition is valid`.

### 8.2 Validation stages

1. **Draft validation** runs as the author edits. It checks required selections,
   empty operands, literal input, arity, locally known types, and result-shape
   completeness.
2. **Project validation** compiles the Creator draft and validates it through the
   route-engine computed-variable contract before save. This catches unknown
   references, unsupported properties/operators, malformed paths, cycles,
   statically determinable type errors, and runtime evaluation/type errors that
   are necessary for engine acceptance. Any internally evaluated result is used
   only for validation and is never displayed.
3. **Persistence validation** ensures the saved resource omits UI-only IDs,
   `valueSource`, top-level `default`, and top-level `value`.

Save is disabled while the local draft is incomplete. If engine validation
fails on submit, the dialog remains open, the most specific card/field receives
an error and focus, and a stable localized toast summarizes the failure. Raw
engine exception text and `console.error` alone are not adequate user feedback.

Validation must inspect all operands, branch conditions, branch results, and the
default, including inactive and short-circuited paths. It must detect direct,
indirect, and self cycles regardless of declaration order.

Unsupported definitions imported from a newer engine version must be preserved
without destructive rewriting. They may be shown read-only with a clear
compatibility error until this editor supports them.

## 9. Dependencies and lifecycle behavior

- Computed variables may depend on stored or computed variables in any authored
  order.
- The detail view must list direct dependencies. Delete flows must also discover
  reverse dependencies.
- Deleting a variable referenced by a computed variable must be blocked and list
  the dependents; it must not leave broken formulas.
- Renaming a display name must not change reference IDs. If resource-ID rename is
  supported, all references must be updated atomically through project commands.
- Duplicating a computed variable copies its definition and keeps references to
  the original dependencies.
- Moving variables between folders must not change expression paths.
- Computed values must be excluded from every variable-mutation target picker,
  including `commandLineUpdateVariable` and any action/editor that emits
  `updateVariable`.
- Attempts to update a computed variable from an existing/imported action must
  produce visible validation rather than disappearing silently.
- Computed variables remain available anywhere stored variables are read:
  templates, visibility/conditions, character names, layout data, action
  conditions, and other computed variables.
- Application/layout rendering that consumes project data must resolve computed
  variables with the engine's resolver. This runtime integration is required
  even though the formula-authoring dialog has no preview.
- Computed values must not be written into mutable project state, context/global
  variable storage, save slots, scoped persistence updates, or rollback action
  records.
- Project export/projection must preserve the exact computed definition and map
  `variableType` to engine `type`.
- Collaboration commands must carry deterministic engine-facing data; UI-only
  node IDs and transient validation state must not enter the shared project.

## 10. Accessibility, localization, and responsive behavior

- Every source, operation, variable, and literal control must have an accessible
  name and associated error text.
- Authors must be able to create, select, expand/collapse, delete, duplicate, and
  reorder nodes and branches without drag and drop.
- After add/remove/reorder, focus must move to the affected card or nearest safe
  control rather than returning to the top of the dialog.
- Nested cards need visible focus indication and cannot communicate type or
  validity through color alone.
- Touch targets must remain usable at narrow widths. The editor becomes
  full-screen where a regular dialog cannot fit.
- Deep trees must wrap labels and controls without horizontal page overflow.
- All author-facing strings, operator names, operand names, errors, empty states,
  and summaries must come from `i18n` in the component/store context.
- The editor must preserve acceptable interaction performance for at least 200
  available variables and a 100-node expression. It must not rebuild unrelated
  branches for a single literal edit where the framework allows targeted state.

## 11. Architecture requirements

- Keep `variables.store.js` and `variables.handlers.js` as the page composition
  root.
- Implement the visual workflow as a dedicated component, proposed location:
  `src/components/computedVariableEditor/`.
- The component owns its local plain-data draft and low-level nested-card
  interactions. It must not import from another component folder.
- Keep pure compile/decode/type/dependency logic outside handlers. Reuse the
  canonical `src/internal/project/` files (`state.js`, `projection.js`, or
  `commands.js` as appropriate) rather than creating a sparse new project-domain
  file without approval.
- If expression catalogs or UI orchestration are shared with another page, put
  them in `src/internal/ui/`. Do not couple this editor directly to the existing
  action-specific `commandLineConditional` component.
- Project mutations go through `projectService` and the established project
  command path.
- Handlers remain orchestration-only, destructure dependencies at the top, and
  use named store selectors rather than `store.getState()`.
- Store only serializable draft state. Do not store service instances, callbacks,
  cleanup functions, DOM nodes, or handler-owned runtime bags.
- Browser-global/focus behavior goes through the owning component, primitive, or
  service boundary, not direct page-handler calls to `window`/`document`.

## 12. Test requirements

### 12.1 Pure model and engine-contract tests

- Encode/decode round trips for Variable, Value, and Operation nodes.
- Encode/decode coverage for every expression operator and each valid arity.
- Separate serialization tests for expression `not: [value]` and condition
  `not: condition`.
- Formula and conditional shapes for all four result types.
- Whole object/array `value` versus operand `{ literal: ... }` behavior.
- Finite-number, null-final-result, unknown-operator, missing-operand, and
  incompatible-type errors.
- Simple, quoted, escaped, nested, and malformed reference paths.
- Stored-to-computed and computed-to-computed dependencies.
- Self, indirect, inactive-branch, default, condition, and short-circuited cycles.
- Unknown references and forbidden namespaces/functions/event context.
- Strict equality/ordering and collection semantics.
- Compile output contains no UI-only fields or top-level stored value fields.

### 12.2 Variables-page and storage tests

- Add one formula variable and one conditional variable through page handlers.
- Edit metadata and formula while keeping result type/source locked.
- Persist and reload computed definitions without AST changes.
- Verify stored-variable creation remains unchanged.
- Verify list/detail markers, summaries, dependencies, and absence of an
  evaluated preview.
- Verify referenced-variable deletion is blocked.
- Verify computed variables are absent from every mutation target picker.
- Verify projection/export maps `variableType` to engine `type` and preserves
  `computed`.
- Add SQLite-backed persistence cases to the Puty suite where appropriate.
- Add collaboration/convergence coverage for simultaneous computed-definition
  edits according to the chosen command granularity.

### 12.3 Interaction and accessibility tests

- Create and edit nested fixed-arity and variadic operations.
- Add, duplicate, delete, and keyboard-reorder operands and branches.
- Confirm destructive source/mode changes.
- Restore focus correctly after structural changes and validation errors.
- Validate collapsed-card error summaries.
- Exercise the full workflow at desktop and narrow/mobile widths.
- Check all controls with keyboard-only navigation and accessible names.
- Confirm that successful validation never renders an evaluated result.

## 13. Acceptance criteria

Version B is ready when all of the following are true:

1. An author can create and edit Formula and Conditional computed variables for
   String, Number, Boolean, and Object results without writing code or JSON.
2. Every expression and condition operation in this document can be authored,
   loaded, and saved without semantic rewriting.
3. Saved Creator and projected engine data satisfy the canonical model and pass
   route-engine validation.
4. Invalid types, paths, arities, shapes, and dependency cycles prevent save and
   identify the relevant UI card.
5. Computed variables cannot be selected or changed by variable-update actions,
   and their evaluated values are never persisted as mutable state.
6. Existing stored-variable workflows and projects continue to work unchanged.
7. The editor is usable with keyboard, touch, desktop, and narrow layouts and all
   copy is localized.
8. The authoring dialog contains no evaluated result preview or test-input UI.
9. Required model, storage, integration, convergence, and interaction tests pass.
