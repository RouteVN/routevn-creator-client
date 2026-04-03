import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectCommittedScene,
  selectProjectData,
} from "../../src/pages/sceneEditor/sceneEditor.store.js";
import {
  createSceneEditorSession,
  swapSceneEditorSessionLine,
} from "../../src/internal/ui/sceneEditor/editorSession.js";

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
      items: {},
      tree: [],
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

describe("sceneEditor.store selectProjectData", () => {
  it("overlays editor-session line order when domain state is not populated", () => {
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

    state.editorSession = swapSceneEditorSessionLine(state.editorSession, {
      lineId: "line-2",
      direction: "up",
    });

    const projectData = selectProjectData({ state });
    const lines =
      projectData.story.scenes["scene-1"].sections["section-1"].lines;

    expect(lines.map((line) => line.id)).toEqual(["line-2", "line-1"]);
    expect(lines[0].actions.dialogue.content[0].text).toBe("second");
  });
});
