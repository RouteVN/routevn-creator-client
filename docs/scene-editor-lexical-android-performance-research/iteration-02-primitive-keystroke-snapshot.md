# Iteration 02 - Primitive Keystroke Snapshot

## Question

What does the Lexical primitive do for one editor update before it dispatches anything to the page?

## Evidence

- Lexical calls `syncFromEditorState(editorState)` from the update listener at `src/primitives/lexicalSceneDocumentEditor.js:1289`.
- `syncFromEditorState` immediately calls `readEditorSnapshot(editorState)` at `src/primitives/lexicalSceneDocumentEditor.js:7345`.
- `readEditorSnapshot` iterates over every root child node and pushes a persistable line with `createPersistableLine` at `src/primitives/lexicalSceneDocumentEditor.js:5529` and `:5543`.
- `createPersistableLine` serializes the line content with `serializeLineContent(lineNode)` at `src/primitives/lexicalSceneDocumentEditor.js:5605`.
- After snapshotting, `syncFromEditorState` clones all snapshot lines into `this.state.lines` at `src/primitives/lexicalSceneDocumentEditor.js:7351`.
- It recomputes `plainText` by walking all snapshot lines and joining them with newlines at `src/primitives/lexicalSceneDocumentEditor.js:7357`.
- It diffs all previous lines against all next lines. Content equality uses `areContentsEqual`, and action equality uses `JSON.stringify(line?.actions || {})` at `src/primitives/lexicalSceneDocumentEditor.js:7428` through `:7439`.
- `areContentsEqual` itself serializes normalized content arrays with `JSON.stringify` at `src/internal/ui/sceneEditorLexical/contentModel.js:257`.
- If any line changed, it dispatches `scene-lines-changed` with another cloned full-section line array at `src/primitives/lexicalSceneDocumentEditor.js:7443` through `:7454`.

## Finding

The primitive treats every Lexical update as a full-section serialization and full-section diff. A single character insertion is not represented as a small delta; it becomes:

1. Full editor snapshot.
2. Full line clone.
3. Full plain-text rebuild.
4. Full content/action diff.
5. Full cloned line payload to the page.

On old Android devices, this alone can become visible input latency for long sections, especially when IME composition produces multiple update events per visible character.

## Optimization Hypothesis

The primitive needs a hot-path distinction between local editor updates and persisted section snapshots. The page probably only needs a full snapshot on debounce, blur, structure edit, format action, or composition end. During normal text insertion, the primitive can track a dirty line id and keep the local editor responsive.

## Confidence

High for the full-section work. Medium for its absolute runtime cost until measured on device.

## Next Question

After the full snapshot leaves the primitive, how much page-level work is triggered?
