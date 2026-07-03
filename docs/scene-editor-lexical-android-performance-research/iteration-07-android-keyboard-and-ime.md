# Iteration 07 - Android Keyboard And IME

## Question

How can Android keyboard, viewport, and IME behavior amplify the editor hot path?

## Evidence

- The mobile keyboard toolbar enables `navigator.virtualKeyboard.overlaysContent` when available at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:139`.
- It reads VirtualKeyboard and VisualViewport geometry at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:153` and `:175`.
- `syncKeyboardState` computes keyboard state, dispatches `keyboard-state-change`, and calls the toolbar's own `render()` at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:325` through `:360`.
- The toolbar listens to `visualViewport.resize`, `visualViewport.scroll`, virtual-keyboard `geometrychange`, window resize/scroll/orientation, and focusin/focusout at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:386` through `:395`.
- The parent page handles `keyboard-state-change` by setting mobile keyboard state and calling page `render()` at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:2280`.
- Composition starts/ends are emitted from the primitive at `src/primitives/lexicalSceneDocumentEditor.js:4786` and `:4799`.
- The page stores composition state on the draft section at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:2034`.
- `handleNativeBeforeInput` returns early for composing input at `src/primitives/lexicalSceneDocumentEditor.js:4630`, but the Lexical update listener still calls `syncFromEditorState` for editor updates at `src/primitives/lexicalSceneDocumentEditor.js:1289`.
- Toolbar pointerdown prevents default for all actions at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:439`, while non-arrow actions rely on a later click at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:502`.
- Toolbar click blurs the active editable before dispatching action-click at `src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js:512`.

## Finding

Android can amplify the slow path in two ways:

1. Keyboard geometry events can trigger a toolbar render and then a parent page render. Parent render rebuilds the heavy scene editor view data and can propagate new props to all mounted section editors.
2. IME composition state is recorded, but it does not appear to suppress full snapshot/diff/render/page dispatch work from Lexical updates during composition.

The toolbar/action path can also create focus/blur and keyboard close/open churn right before opening mobile action UI.

## Optimization Hypothesis

- Keyboard state should update a narrow layout/inset lane, not full scene editor view data.
- Avoid parent render if rounded keyboard metrics did not materially change or if only toolbar-local state changed.
- During composition, keep updates local to Lexical and defer full draft/page/runtime sync until composition end or a short idle debounce.
- Treat toolbar action clicks as commands that preserve editor state without forcing avoidable blur/layout churn unless the action truly requires closing the keyboard.

## Confidence

High for duplicate render risk and event volume risk. Medium for click synthesis risk because it requires device validation.

## Next Question

How expensive is project-data projection when canvas/runtime sync is triggered?
