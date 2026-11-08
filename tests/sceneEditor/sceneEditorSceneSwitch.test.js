import { readFileSync } from "node:fs";
import { Subject } from "rxjs";
import { h } from "snabbdom/build/h.js";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import { parse } from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/index.js";
import * as handlers from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import * as storeModule from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { composeRepositoryState } from "../../src/deps/services/shared/projectRepositoryViews/sceneStateView.js";
import { projectRepositoryStateToDomainState } from "../../src/internal/project/projection.js";
import { EN_I18N } from "../support/i18n.js";

const SCENE_EDITOR_VIEW = yaml.load(
  readFileSync(
    new URL(
      "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const bindStore = (state) =>
  Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([name, fn]) => [
        name,
        (payload) => fn({ state, i18n: EN_I18N }, payload),
      ]),
  );

const createLine = (id, text) => ({
  id,
  actions: {
    dialogue: { content: [{ text }] },
    updateVariable: {
      id: `update-${id}`,
      operations: [{ variableId: "variable-1", op: "set", value: 1 }],
    },
  },
});

const createTree = (items) => ({
  items: Object.fromEntries(items.map((item) => [item.id, item])),
  tree: items.map((item) => ({ id: item.id, children: [] })),
});

const createSection = (id, lines = []) => ({
  id,
  name: id,
  lines: createTree(lines),
});

const createScene = (id, sections) => ({
  id,
  type: "scene",
  name: id,
  sections: createTree(sections),
});

const OTHER_SECTION_ID = "x-5\u{1F600}";

// Main state holds each scene's sections without lines. Only the scene the
// project has loaded adds its lines, as in the app.
const createProject = () => {
  const loadedScenes = {
    "scene-1": createScene("scene-1", [
      createSection("section-1", [createLine("line-1", "First")]),
      createSection("section-2", [createLine("line-2", "Second")]),
      createSection("section-3", [
        createLine("line-3", "Third"),
        createLine("line-4", "Third, continued"),
      ]),
    ]),
    "scene-2": createScene("scene-2", [
      createSection("section-4", [createLine("line-5", "Other scene")]),
    ]),
    // A section id with characters a view id may not hold.
    "scene-3": createScene("scene-3", [
      createSection(OTHER_SECTION_ID, [createLine("line-6", "Third scene")]),
    ]),
  };
  const mainState = {
    story: { initialSceneId: "scene-1" },
    scenes: {
      items: {
        "scene-1": createScene("scene-1", [
          createSection("section-1"),
          createSection("section-2"),
          createSection("section-3"),
        ]),
        "scene-2": createScene("scene-2", [createSection("section-4")]),
        "scene-3": createScene("scene-3", [createSection(OTHER_SECTION_ID)]),
      },
      tree: [
        { id: "scene-1", children: [] },
        { id: "scene-2", children: [] },
        { id: "scene-3", children: [] },
      ],
    },
  };
  let activeSceneId;
  let notifyListener;
  // A scene listed here loads once its promise resolves.
  const sceneLoads = {};
  const getRepositoryState = () =>
    composeRepositoryState({
      mainState,
      activeSceneId,
      activeSceneState: activeSceneId
        ? {
            scenes: { items: { [activeSceneId]: loadedScenes[activeSceneId] } },
          }
        : undefined,
    });
  const getDomainState = () =>
    projectRepositoryStateToDomainState({
      repositoryState: getRepositoryState(),
    });

  return {
    sceneLoads,
    subscribeProjectState: (listener) => {
      notifyListener = listener;
      return () => {};
    },
    // Like the project runtime, this notifies the new state before it
    // resolves.
    setActiveSceneId: vi.fn(async (sceneId) => {
      await sceneLoads[sceneId];
      activeSceneId = sceneId;
      notifyListener?.({
        repositoryState: getRepositoryState(),
        domainState: getDomainState(),
        revision: 1,
      });
    }),
    getEnsuredProjectId: () => "project-1",
    getRepositoryState,
    getDomainState,
    getRepositoryRevision: () => 1,
    cacheSceneTextStats: vi.fn(async () => {}),
    syncSectionLinesSnapshot: vi.fn(async () => ({ valid: true })),
  };
};

const mountSceneEditor = () => {
  const projectService = createProject();
  const state = storeModule.createInitialState();
  const store = bindStore(state);
  const subject = new Subject();
  subject.dispatch = (action, payload) => subject.next({ action, payload });
  let routePayload = { p: "project-1" };
  const deps = {
    store,
    projectService,
    appService: {
      getUserConfig: () => undefined,
      registerBeforeNavigation: () => () => {},
      getPayload: () => routePayload,
      setPayload: (payload) => {
        routePayload = payload;
      },
      showToast: vi.fn(),
      showAlert: vi.fn(),
      showAlertWhenIdle: vi.fn(),
      reportError: vi.fn(),
      blurActiveElement: vi.fn(),
    },
    browserEventsClient: { subscribeWindowEvent: () => () => {} },
    graphicsService: { engineSelectSectionLineChanges: () => ({}) },
    refs: {},
    render: vi.fn(),
    subject,
    i18n: EN_I18N,
    uiConfig: {},
  };
  handlers.handleBeforeMount(deps);
  return { deps, state, store, projectService };
};

const selectShownLineIds = (store) =>
  Object.fromEntries(
    store
      .selectScene()
      .sections.map((section) => [
        section.id,
        section.lines.map((line) => line.id),
      ]),
  );

const selectCachedLineCounts = (projectService, sceneId) =>
  projectService.cacheSceneTextStats.mock.calls
    .filter(([options]) => options.sceneId === sceneId)
    .map(([options]) => options.textStats.lineCount);

const editSectionThree = (deps) =>
  handlers.handleEditorDataChanged(deps, {
    _event: {
      currentTarget: { dataset: { sectionId: "section-3" } },
      detail: {
        lines: [
          createLine("line-3", "Third"),
          createLine("line-4", "Third, continued"),
        ],
        selectedLineId: "line-4",
        reason: "text",
      },
    },
  });

const SCENE_ONE_LINE_IDS = {
  "section-1": ["line-1"],
  "section-2": ["line-2"],
  "section-3": ["line-3", "line-4"],
};

const renderSectionBlockKeys = (state) => {
  const rendered = parseView({
    h,
    template: parse(SCENE_EDITOR_VIEW.template),
    viewData: storeModule.selectViewData({ state, i18n: EN_I18N }),
    refs: SCENE_EDITOR_VIEW.refs,
    handlers,
  });
  const keys = [];
  const visit = (node) => {
    if (node.data?.attrs?.["data-section-block-id"]) {
      keys.push(node.data.key);
    }
    node.children?.forEach(visit);
  };
  visit(rendered);
  return keys;
};

describe("scene editor scene switch", () => {
  it("keeps the lines of the section selected when the scene was left", async () => {
    const { deps, store, projectService } = mountSceneEditor();
    await handlers.syncSceneEditorRoutePayload(deps, { s: "scene-1" });

    // Editing section 3 selects it.
    await editSectionThree(deps);
    expect(store.selectSelectedSectionId()).toBe("section-3");

    // Another scene, then back, without leaving the scene editor, as from
    // Recently Visited or Back.
    await handlers.syncSceneEditorRoutePayload(deps, { s: "scene-2" });
    await handlers.syncSceneEditorRoutePayload(deps, { s: "scene-1" });

    expect(selectShownLineIds(store)).toEqual(SCENE_ONE_LINE_IDS);
    // Scene 1's text stats are never counted from scene 2's lines.
    expect(new Set(selectCachedLineCounts(projectService, "scene-1"))).toEqual(
      new Set([4]),
    );
    // Only the edit is saved, when scene 1 is left.
    expect(
      projectService.syncSectionLinesSnapshot.mock.calls.map(([options]) => [
        options.sectionId,
        options.lines.map((line) => line.id),
      ]),
    ).toEqual([["section-3", ["line-3", "line-4"]]]);
  });

  it("ignores the project state while a replaced switch ends and the next still loads", async () => {
    const { deps, store, projectService } = mountSceneEditor();
    await handlers.syncSceneEditorRoutePayload(deps, { s: "scene-1" });
    await editSectionThree(deps);

    // Scene 2 is opened, then scene 3 before scene 2 has loaded.
    let openedSceneId = "scene-2";
    let finishSceneTwoLoad;
    let finishSceneThreeLoad;
    projectService.sceneLoads["scene-2"] = new Promise((resolve) => {
      finishSceneTwoLoad = resolve;
    });
    projectService.sceneLoads["scene-3"] = new Promise((resolve) => {
      finishSceneThreeLoad = resolve;
    });
    const toSceneTwo = handlers.syncSceneEditorRoutePayload(
      deps,
      { s: "scene-2" },
      { shouldContinue: () => openedSceneId === "scene-2" },
    );
    await vi.waitFor(() =>
      expect(projectService.setActiveSceneId).toHaveBeenLastCalledWith(
        "scene-2",
      ),
    );
    openedSceneId = "scene-3";
    const toSceneThree = handlers.syncSceneEditorRoutePayload(
      deps,
      { s: "scene-3" },
      { shouldContinue: () => openedSceneId === "scene-3" },
    );
    await vi.waitFor(() =>
      expect(projectService.setActiveSceneId).toHaveBeenLastCalledWith(
        "scene-3",
      ),
    );

    // Scene 2's switch ends first; scene 3's state arrives after it.
    finishSceneTwoLoad();
    await toSceneTwo;
    finishSceneThreeLoad();
    await toSceneThree;
    expect(store.selectSceneId()).toBe("scene-3");

    expect(new Set(selectCachedLineCounts(projectService, "scene-1"))).toEqual(
      new Set([4]),
    );
    await handlers.syncSceneEditorRoutePayload(deps, { s: "scene-1" });
    expect(selectShownLineIds(store)).toEqual(SCENE_ONE_LINE_IDS);
  });

  it("drops saved drafts when the scene changes and keeps unsaved ones", () => {
    const state = storeModule.createInitialState();
    const store = bindStore(state);
    store.setSceneId({ sceneId: "scene-1" });
    store.setDraftSection({
      draftSection: {
        sceneId: "scene-1",
        sectionId: "section-1",
        lines: [createLine("line-1", "First")],
        dirty: false,
      },
    });
    store.setDraftSection({
      draftSection: {
        sceneId: "scene-1",
        sectionId: "section-2",
        lines: [createLine("line-2", "Second, edited")],
        dirty: true,
      },
    });
    store.setDraftSection({
      draftSection: {
        sceneId: "scene-2",
        sectionId: "section-4",
        lines: [createLine("line-5", "Other scene")],
        dirty: false,
      },
    });

    store.setSceneId({ sceneId: "scene-2" });

    expect(Object.keys(state.draftSections)).toEqual(["scene-1:section-2"]);
  });

  it("keys each section's block, and so its editor, by the section", async () => {
    const state = storeModule.createInitialState();
    const store = bindStore(state);
    const project = createProject();

    const renderScene = async (sceneId) => {
      await project.setActiveSceneId(sceneId);
      store.setRepositoryState({ repository: project.getRepositoryState() });
      store.setDomainState({ domainState: project.getDomainState() });
      store.setSceneId({ sceneId });
      return renderSectionBlockKeys(state);
    };

    // The first section of each scene gets its own key, so the editor of
    // scene 1's first section is not reused for scene 2's first section.
    // Characters a view id may not hold, and "x", are escaped.
    const sceneOneKeys = await renderScene("scene-1");
    expect(sceneOneKeys).toEqual([
      "sectionBlocksectionx00002d1",
      "sectionBlocksectionx00002d2",
      "sectionBlocksectionx00002d3",
    ]);
    expect(await renderScene("scene-2")).toEqual([
      "sectionBlocksectionx00002d4",
    ]);
    expect(await renderScene("scene-3")).toEqual([
      "sectionBlockx000078x00002d5x01f600",
    ]);
    expect(await renderScene("scene-1")).toEqual(sceneOneKeys);
  });
});
