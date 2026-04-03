import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import { renderSceneEditorState } from "../../src/internal/ui/sceneEditor/runtime.js";

const createProjectData = () => {
  return {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
    },
    resources: {
      images: {},
      videos: {},
      sounds: {},
      fonts: {},
      colors: {},
      textStyles: {},
      controls: {},
      transforms: {},
      characters: {},
      animations: {},
      variables: {},
      layouts: {
        adv: {
          id: "adv",
          name: "ADV Layout",
          layoutType: "dialogue",
          isFragment: false,
          elements: [
            {
              id: "adv-root",
              type: "text",
              content: "${dialogue.content[0].text}",
            },
          ],
        },
        nvl: {
          id: "nvl",
          name: "NVL Layout",
          layoutType: "nvl",
          isFragment: false,
          elements: [
            {
              id: "nvl-root",
              type: "container",
              children: [
                {
                  id: "nvl-item-${i}",
                  type: "text",
                  $each: "line, i in dialogue.lines",
                  content: "${line.content[0].text}",
                },
              ],
            },
          ],
        },
      },
    },
    story: {
      initialSceneId: "scene-1",
      scenes: {
        "scene-1": {
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: {
            "section-1": {
              name: "Section 1",
              initialLineId: "line-1",
              lines: [
                {
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
                {
                  id: "line-2",
                  actions: {
                    dialogue: {
                      content: [{ text: "second" }],
                    },
                  },
                },
              ],
            },
          },
        },
      },
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

describe("renderSceneEditorState", () => {
  it("re-initializes the engine for selected-line preview updates", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      presentationState: undefined,
    };

    graphicsService.initRouteEngine(projectData, {
      enableGlobalKeyboardBindings: false,
    });

    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
      }),
    ).resolves.toBeUndefined();

    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
      }),
    ).resolves.toBeUndefined();

    expect(store.presentationState?.dialogue?.ui?.resourceId).toBe("adv");
    expect(store.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );
  });
});
