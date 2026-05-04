import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectProjectData,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { SKIP_MODE_CONDITION_TARGET } from "../../src/internal/layoutConditions.js";

const createCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const createRepositoryState = () => ({
  project: {
    resolution: {
      width: 1920,
      height: 1080,
    },
  },
  story: {
    initialSceneId: "scene-1",
  },
  files: createCollection(),
  images: createCollection(),
  videos: createCollection(),
  sounds: createCollection(),
  particles: createCollection(),
  spritesheets: createCollection(),
  colors: createCollection({
    "color-1": {
      id: "color-1",
      type: "color",
      hex: "#ffffff",
    },
  }),
  fonts: createCollection({
    "font-1": {
      id: "font-1",
      type: "font",
      fileId: "font-file-1",
    },
  }),
  textStyles: createCollection({
    "style-1": {
      id: "style-1",
      type: "textStyle",
      fontId: "font-1",
      colorId: "color-1",
      fontSize: 32,
      lineHeight: 1.2,
    },
  }),
  layouts: createCollection({
    "layout-1": {
      id: "layout-1",
      type: "layout",
      name: "Layout 1",
      layoutType: "normal",
      elements: {
        items: {
          "text-1": {
            id: "text-1",
            type: "text",
            name: "Text",
            x: 0,
            y: 0,
            width: 100,
            height: 20,
            text: "Hello",
            textStyleId: "style-1",
            conditionalOverrides: [
              {
                when: {
                  target: SKIP_MODE_CONDITION_TARGET,
                  op: "eq",
                  value: false,
                },
                set: {
                  textStyle: {
                    align: "center",
                  },
                },
              },
            ],
          },
        },
        tree: [{ id: "text-1" }],
      },
    },
  }),
  controls: createCollection(),
  transforms: createCollection(),
  characters: createCollection(),
  animations: createCollection(),
  variables: createCollection(),
  scenes: createCollection({
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
                      content: [
                        {
                          text: "Styled dialogue",
                          textStyle: {
                            fill: "#b45309",
                          },
                          textStyleSegmentId: "legacy-segment-id",
                        },
                      ],
                    },
                  },
                },
              },
              tree: [{ id: "line-1" }],
            },
          },
        },
        tree: [{ id: "section-1" }],
      },
    },
  }),
});

describe("sceneEditorLexical.store selectProjectData", () => {
  it("sanitizes legacy dialogue textStyle metadata without stripping layout textStyle overrides", () => {
    const state = createInitialState();
    state.sceneId = "scene-1";
    state.selectedSectionId = "section-1";
    state.selectedLineId = "line-1";
    state.repositoryState = createRepositoryState();

    const projectData = selectProjectData({ state });
    const dialogueContent =
      projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions
        .dialogue.content;
    const conditionalTextStyleId =
      projectData.resources.layouts["layout-1"].elements[0][
        "$if runtime.skipMode == false"
      ].textStyleId;

    expect(dialogueContent[0]).toMatchObject({
      text: "Styled dialogue",
    });
    expect(dialogueContent[0]).not.toHaveProperty("textStyleId");
    expect(dialogueContent[0]).not.toHaveProperty("textStyle");
    expect(dialogueContent[0]).not.toHaveProperty("textStyleSegmentId");
    expect(projectData.resources.textStyles[conditionalTextStyleId]).toEqual(
      expect.objectContaining({
        align: "center",
      }),
    );
  });
});
