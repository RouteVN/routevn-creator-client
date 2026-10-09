import { beforeEach, describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handlePreviewClick,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import {
  createSceneEditorDraftSection,
  replaceSceneEditorDraftSectionLines,
} from "../../src/internal/ui/sceneEditorLexical/draftSection.js";
import { EN_I18N } from "../support/i18n.js";

const line = (id, text) => ({
  id,
  actions: { dialogue: { content: [{ text }] } },
});

const toSection = (id, name, lines) => ({
  id,
  name,
  lines: {
    items: Object.fromEntries(
      lines.map((item) => [item.id, structuredClone(item)]),
    ),
    tree: lines.map(({ id: lineId }) => ({ id: lineId })),
  },
});

const savedLines = {
  "section-1": [line("a", "saved one"), line("b", "saved two")],
  "section-2": [line("c", "other section")],
};

const createRepositoryState = () => ({
  scenes: {
    items: {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        name: "Scene One",
        sections: {
          items: {
            "section-1": toSection(
              "section-1",
              "Section One",
              savedLines["section-1"],
            ),
            "section-2": toSection("section-2", "", savedLines["section-2"]),
          },
          tree: [{ id: "section-1" }, { id: "section-2" }],
        },
      },
      "scene-2": {
        id: "scene-2",
        type: "scene",
        name: "Scene Two",
        sections: {
          items: {
            "section-3": toSection("section-3", "Section Three", [
              line("d", "scene two line"),
            ]),
          },
          tree: [{ id: "section-3" }],
        },
      },
    },
    tree: [{ id: "scene-1" }, { id: "scene-2" }],
  },
});

// The real store, with its state bound, as the page's components see it.
const bindStore = (state) =>
  Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([name, fn]) => [
        name,
        (payload) => fn({ state, i18n: EN_I18N }, payload),
      ]),
  );

// An editor element that, like the real one, shows what replaceLines gives it.
const createEditor = (sectionId, lines) => {
  let current = structuredClone(lines);
  return {
    dataset: { sectionId },
    focusLine: vi.fn(),
    blurEditor: vi.fn(),
    getLines: vi.fn(() => structuredClone(current)),
    replaceLines: vi.fn(({ lines: next }) => {
      current = structuredClone(next);
    }),
  };
};

const typedLines = [
  line("a", "saved one"),
  line("b", "typed over the saved line"),
  line("new-1", "typed new line"),
];

const refused = {
  valid: false,
  error: {
    code: "precondition_validation_failed",
    message: "payload.lines.lineId must not already exist",
  },
};

describe("scene editor: a draft that cannot be saved", () => {
  let store;
  let repositoryState;
  let editors;
  let deps;
  let syncSectionLinesSnapshot;

  const makeDirty = (sectionId, lines) => {
    store.setDraftSection({
      draftSection: replaceSceneEditorDraftSectionLines(
        createSceneEditorDraftSection({
          sceneId: store.selectSceneId(),
          sectionId,
          section: { lines: savedLines[sectionId] ?? [] },
          revision: 5,
        }),
        { lines, source: "text", dirty: true },
      ),
    });
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const state = storeModule.createInitialState();
    store = bindStore(state);
    repositoryState = createRepositoryState();
    store.setSceneId({ sceneId: "scene-1" });
    store.setRepositoryState({ repository: repositoryState });
    store.setRepositoryRevision({ revision: 5 });
    store.setSelectedSectionId({ selectedSectionId: "section-1" });
    store.setSelectedLineId({ selectedLineId: "new-1" });
    editors = {
      first: createEditor("section-1", typedLines),
      second: createEditor("section-2", savedLines["section-2"]),
    };
    syncSectionLinesSnapshot = vi.fn(async () => refused);
    deps = {
      store,
      i18n: EN_I18N,
      refs: { sectionEditor0: editors.first, sectionEditor1: editors.second },
      render: vi.fn(),
      subject: { dispatch: vi.fn() },
      appService: {
        showAlert: vi.fn(),
        showAlertWhenIdle: vi.fn(),
        reportError: vi.fn(),
        blurActiveElement: vi.fn(),
      },
      projectService: {
        syncSectionLinesSnapshot,
        getRepositoryState: () => repositoryState,
        getDomainState: () => ({}),
        getRepositoryRevision: () => 5,
        cacheSceneTextStats: vi.fn(async () => {}),
        getEnsuredProjectId: () => "project-1",
      },
    };
    makeDirty("section-1", typedLines);
  });

  it("puts the section and its editor back to the stored lines, says where, and lets navigation go on", async () => {
    store.recordLineEdit({
      before: {
        b: { sectionId: "section-1", line: savedLines["section-1"][1] },
      },
      after: { b: { sectionId: "section-1", line: typedLines[1] } },
      mergeKey: "b",
      time: 1,
      baselines: { "section-1": typedLines },
    });
    expect(store.selectEditHistoryStep({ direction: "undo" })).toBeDefined();

    await expect(
      prepareSceneEditorNavigation(deps, { path: "/project/images" }),
    ).resolves.toBeUndefined();

    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
    // The editor shows the stored lines, even though it held other text, and
    // nothing is left to save.
    expect(editors.first.replaceLines).toHaveBeenCalledTimes(1);
    expect(editors.first.replaceLines.mock.calls[0][0].lines).toEqual(
      savedLines["section-1"],
    );
    expect(editors.second.replaceLines).not.toHaveBeenCalled();
    expect(store.selectPendingDraftSections()).toEqual([]);
    expect(
      store.selectScene().sections.find((section) => section.id === "section-1")
        .lines,
    ).toEqual(savedLines["section-1"]);

    // Undo cannot bring back what was dropped, and the selected line, which
    // no longer exists, moves to one that does.
    expect(store.selectEditHistoryStep({ direction: "undo" })).toBeUndefined();
    expect(store.selectSelectedLineId()).toBe("a");
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      expect.objectContaining({ skipRender: true }),
    );

    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlertWhenIdle.mock.calls[0][0].message).toBe(
      "Your latest changes to section “Section One” in scene “Scene One” could not be saved and were removed. Please enter them again.\n\nDetails:\npayload.lines.lineId must not already exist",
    );
    expect(deps.appService.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "precondition_validation_failed" }),
      {
        operation: "sceneEditor.saveDraft",
        code: "precondition_validation_failed",
      },
    );
  });

  it("names an unnamed section by its position", async () => {
    store.setSelectedSectionId({ selectedSectionId: "section-2" });
    makeDirty("section-2", [line("c", "typed in the second section")]);
    editors.second.getLines.mockReturnValue([
      line("c", "typed in the second section"),
    ]);
    store.setDraftSection({
      draftSection: {
        ...store.selectDraftSectionBySectionId({ sectionId: "section-1" }),
        dirty: false,
      },
    });

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(
      deps.appService.showAlertWhenIdle.mock.calls[0][0].message,
    ).toContain("section “Section 2” in scene “Scene One”");
  });

  it("keeps editing from the stored lines: later edits save normally", async () => {
    await prepareSceneEditorNavigation(deps, { path: "/project/images" });
    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);

    // The user types again after the revert; the save now works.
    syncSectionLinesSnapshot.mockResolvedValue({ valid: true });
    const next = [...savedLines["section-1"], line("new-2", "typed again")];
    editors.first.replaceLines({ lines: next });
    makeDirty("section-1", next);

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
    expect(syncSectionLinesSnapshot.mock.calls[1][0]).toMatchObject({
      sectionId: "section-1",
      lines: next,
    });
    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);
    expect(store.selectPendingDraftSections()).toEqual([]);
  });

  it("drops the draft of a section that no longer exists and still names it", async () => {
    repositoryState = structuredClone(repositoryState);
    delete repositoryState.scenes.items["scene-1"].sections.items["section-1"];
    repositoryState.scenes.items["scene-1"].sections.tree = [
      { id: "section-2" },
    ];

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(
      store.selectDraftSectionBySectionId({ sectionId: "section-1" }),
    ).toBeUndefined();
    expect(store.selectPendingDraftSections()).toEqual([]);
    expect(
      deps.appService.showAlertWhenIdle.mock.calls[0][0].message,
    ).toContain("section “Section” in scene “Scene One”");
  });

  it("does not reload another section's editor when this section has none", async () => {
    deps.refs = { sectionEditor1: editors.second };

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(editors.second.replaceLines).not.toHaveBeenCalled();
    expect(
      store.selectDraftSectionBySectionId({ sectionId: "section-1" }),
    ).toMatchObject({ dirty: false, lines: savedLines["section-1"] });
  });

  it("does not save the previous scene's editor into the next scene's section", async () => {
    // During a scene switch the store already holds the next scene while the
    // editors on screen still show the previous one.
    store.setDraftSection({
      draftSection: {
        ...store.selectDraftSectionBySectionId({ sectionId: "section-1" }),
        dirty: false,
      },
    });
    store.setSceneId({ sceneId: "scene-2" });
    store.setSelectedSectionId({ selectedSectionId: "section-3" });
    deps.refs = { sectionEditor0: editors.first };

    await prepareSceneEditorNavigation(deps, { reason: "backup" });

    expect(syncSectionLinesSnapshot).not.toHaveBeenCalled();
    expect(deps.appService.showAlertWhenIdle).not.toHaveBeenCalled();
    expect(store.selectPendingDraftSections()).toEqual([]);
  });

  it("does not save the dropped text again when preview was asked for during the failed save", async () => {
    let failSave;
    syncSectionLinesSnapshot
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            failSave = () => resolve(refused);
          }),
      )
      .mockResolvedValue({ valid: true });

    const backup = prepareSceneEditorNavigation(deps, { reason: "backup" });
    await vi.waitFor(() =>
      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1),
    );
    // Preview reads the editor's lines now, before the save fails.
    handlePreviewClick(deps, {});
    failSave();
    await backup;
    await vi.waitFor(() =>
      expect(store.selectViewData().previewVisible).toBe(true),
    );

    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);
    expect(
      store.selectDraftSectionBySectionId({ sectionId: "section-1" }),
    ).toMatchObject({ dirty: false, lines: savedLines["section-1"] });
    // Preview starts from a line that still exists, not the dropped one.
    expect(store.selectViewData().previewLineId).toBe("a");
  });

  it("starts preview where it was asked from, even if the selection moves during the save", async () => {
    syncSectionLinesSnapshot.mockResolvedValue({ valid: true });
    store.setSelectedLineId({ selectedLineId: "b" });
    let finishSave;
    syncSectionLinesSnapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ valid: true });
        }),
    );

    handlePreviewClick(deps, {});
    await vi.waitFor(() =>
      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1),
    );
    // The user selects a line in another section while the save runs.
    store.setSelectedSectionId({ selectedSectionId: "section-2" });
    store.setSelectedLineId({ selectedLineId: "c" });
    finishSave();
    await vi.waitFor(() =>
      expect(store.selectViewData().previewVisible).toBe(true),
    );

    expect(store.selectViewData().previewSectionId).toBe("section-1");
    expect(store.selectViewData().previewLineId).toBe("b");
  });

  it("leaves a successful save alone", async () => {
    syncSectionLinesSnapshot.mockResolvedValue({ valid: true });

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(editors.first.replaceLines).not.toHaveBeenCalled();
    expect(deps.appService.showAlertWhenIdle).not.toHaveBeenCalled();
    expect(deps.appService.reportError).not.toHaveBeenCalled();
  });
});
