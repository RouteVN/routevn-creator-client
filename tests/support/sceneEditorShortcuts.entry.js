export { LexicalSceneDocumentEditorElement } from "../../src/primitives/lexicalSceneDocumentEditor.js";
import {
  handleEditorDataChanged,
  handleNewLine,
  handleSelectedLineChanged,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import {
  focusLine,
  getLines,
  scrollLineIntoView,
} from "../../src/components/sceneDocumentEditorLexical/sceneDocumentEditorLexical.methods.js";

// Exercise the production page handlers and wrapper methods around the real
// primitive. Persistence and canvas rendering are outside this input fixture.
export function mountShortcutPage(owner, selectedLineId) {
  owner.id = "editor";
  const wrapper = owner.getRootNode().host;
  wrapper.dataset.sectionId = "section-1";
  wrapper.focusLine = focusLine;
  wrapper.getLines = getLines;
  wrapper.scrollLineIntoView = scrollLineIntoView;
  const state = {
    selectedLineId,
    draftSection: {
      sceneId: "scene-1",
      sectionId: "section-1",
      dirty: false,
      lines: Array.from({ length: 6 }, (_, index) => ({
        id: `line-${index + 1}`,
        sectionId: "section-1",
        actions: { dialogue: { content: [{ text: `Line ${index + 1}` }] } },
      })),
    },
  };
  const store = {
    selectIsSectionsOverviewOpen: () => false,
    selectSelectedSectionId: () => "section-1",
    selectScene: () => ({
      sections: [{ id: "section-1", lines: state.draftSection.lines }],
    }),
    selectDraftSection: () => state.draftSection,
    setDraftSection: ({ draftSection }) => {
      state.draftSection = draftSection;
    },
    selectSelectedLineId: () => state.selectedLineId,
    setSelectedLineId: ({ selectedLineId }) => {
      state.selectedLineId = selectedLineId;
    },
    selectDraftSaveTimerId: () => undefined,
    selectPendingDraftSections: () => [],
    setDraftSavePendingSinceAt: () => {},
  };
  const deps = {
    store,
    refs: { linesEditor: wrapper },
    subject: { dispatch: () => {} },
    render: () => {
      owner.lines = state.draftSection.lines;
      owner.selectedLineId = state.selectedLineId;
    },
  };
  for (const [eventName, handler] of Object.entries({
    newLine: handleNewLine,
    "selected-line-changed": handleSelectedLineChanged,
    "scene-lines-changed": handleEditorDataChanged,
  })) {
    owner.addEventListener(eventName, (event) => {
      handler(deps, {
        _event: { detail: event.detail, currentTarget: wrapper },
      });
    });
  }
  deps.render();
  owner.enterBlockMode({ lineId: selectedLineId });
  return state;
}
