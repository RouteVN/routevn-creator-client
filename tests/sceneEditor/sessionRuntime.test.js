import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  createInitialState,
  selectCommittedScene,
  selectProjectData,
  selectSceneId,
  selectSelectedLineId,
  selectSelectedSectionId,
} from "../../src/pages/sceneEditor/sceneEditor.store.js";
import {
  createSceneEditorSession,
  swapSceneEditorSessionLine,
} from "../../src/internal/ui/sceneEditor/editorSession.js";
import { renderSceneEditorState } from "../../src/internal/ui/sceneEditor/runtime.js";

const createRepositoryState = () => {
  return {
    project: {
      resolution: {
        width: 1920,
        height: 1080,
      },
    },
    story: {
      initialSceneId: "scene-1",
    },
    layouts: {
      items: {
        adv: {
          id: "adv",
          type: "layout",
          name: "ADV Layout",
          layoutType: "dialogue",
          elements: {
            items: {
              "adv-root": {
                id: "adv-root",
                type: "text",
                content: "${dialogue.content[0].text}",
              },
            },
            tree: [{ id: "adv-root" }],
          },
        },
      },
      tree: [{ id: "adv" }],
    },
    controls: {
      items: {},
      tree: [],
    },
    images: {
      items: {},
      tree: [],
    },
    videos: {
      items: {},
      tree: [],
    },
    sounds: {
      items: {},
      tree: [],
    },
    fonts: {
      items: {},
      tree: [],
    },
    colors: {
      items: {},
      tree: [],
    },
    textStyles: {
      items: {},
      tree: [],
    },
    transforms: {
      items: {},
      tree: [],
    },
    characters: {
      items: {},
      tree: [],
    },
    animations: {
      items: {},
      tree: [],
    },
    variables: {
      items: {},
      tree: [],
    },
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: {
            items: {
              "section-1": {
                id: "section-1",
                name: "Section 1",
                initialLineId: "line-1",
                lines: {
                  items: {
                    "line-1": {
                      id: "line-1",
                      actions: {
                        dialogue: {
                          mode: "adv",
                          ui: {
                            resourceId: "adv",
                          },
                          content: [{ text: "first" }],
                        },
                      },
                    },
                    "line-2": {
                      id: "line-2",
                      actions: {
                        dialogue: {
                          content: [{ text: "second" }],
                        },
                      },
                    },
                  },
                  tree: [{ id: "line-1" }, { id: "line-2" }],
                },
              },
            },
            tree: [{ id: "section-1" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    },
  };
};

const createGraphicsService = () => {
  let engine;

  return {
    initRouteEngine: (projectData) => {
      engine = createRouteEngine({
        handlePendingEffects() {},
      });
      engine.init({
        initialState: {
          global: {},
          projectData,
        },
      });
    },
    engineSelectRenderState: () => engine?.selectRenderState(),
    ensureAudioAssetsLoaded: async () => {},
    engineRenderCurrentState: () => {},
    engineHandleActions: (actions, eventContext, options) => {
      engine?.handleActions(actions, eventContext, options);
    },
    engineSelectPresentationState: () => engine?.selectPresentationState(),
  };
};

describe("renderSceneEditorState with repository fallback project data", () => {
  it("updates dialogue presentation after swapping lines", async () => {
    const state = createInitialState();
    state.sceneId = "scene-1";
    state.selectedSectionId = "section-1";
    state.selectedLineId = "line-2";
    state.repositoryState = createRepositoryState();

    const committedScene = selectCommittedScene({ state });
    state.editorSession = createSceneEditorSession({
      sceneId: "scene-1",
      sectionId: "section-1",
      section: committedScene.sections[0],
      revision: 1,
    });

    const store = {
      selectSceneId: () => selectSceneId({ state }),
      selectSelectedSectionId: () => selectSelectedSectionId({ state }),
      selectSelectedLineId: () => selectSelectedLineId({ state }),
      selectProjectData: () => selectProjectData({ state }),
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        state.presentationState = presentationState;
      },
    };
    const graphicsService = createGraphicsService();

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    expect(state.presentationState?.dialogue?.ui?.resourceId).toBe("adv");
    expect(state.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );

    state.editorSession = swapSceneEditorSessionLine(state.editorSession, {
      lineId: "line-2",
      direction: "up",
    });

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    expect(state.presentationState?.dialogue?.ui).toBeUndefined();
    expect(state.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );
  });
});
