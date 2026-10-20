import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  createInitialState,
  selectProjectData,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { SKIP_MODE_CONDITION_TARGET } from "../../src/internal/layoutConditions.js";

const createCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const STYLED_DIALOGUE_CONTENT = [
  {
    text: "Styled dialogue",
    textStyle: {
      fill: "#b45309",
    },
    textStyleSegmentId: "legacy-segment-id",
  },
  { text: " and " },
  { text: "bold", textStyle: { fontWeight: "bold" } },
  { text: "italic", textStyle: { fontStyle: "italic" } },
  { text: "underline", textStyle: { textDecoration: "underline" } },
];

const createRepositoryState = ({
  dialogueContent = STYLED_DIALOGUE_CONTENT,
} = {}) => ({
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
    "layout-dialogue": {
      id: "layout-dialogue",
      type: "layout",
      name: "Dialogue",
      layoutType: "dialogue-adv",
      elements: {
        items: {
          "dialogue-text": {
            id: "dialogue-text",
            type: "text-revealing-ref-dialogue-content",
            name: "Dialogue Text",
            x: 0,
            y: 0,
            width: 800,
            height: 100,
            textStyleId: "style-1",
          },
        },
        tree: [{ id: "dialogue-text" }],
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
                      mode: "adv",
                      gui: { resourceId: "layout-dialogue" },
                      content: dialogueContent,
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

const selectCanvasProjectData = (options) => {
  const state = createInitialState();
  state.sceneId = "scene-1";
  state.selectedSectionId = "section-1";
  state.selectedLineId = "line-1";
  state.repositoryState = createRepositoryState(options);
  return selectProjectData({ state });
};

const renderDialogueText = (projectData) => {
  const engine = createRouteEngine({ handlePendingEffects: () => {} });
  engine.init({ initialState: { global: {}, projectData } });
  const collectText = (elements) =>
    elements.flatMap((element) =>
      element.type === "text-revealing"
        ? [element]
        : collectText(element.children ?? []),
    );
  return collectText(engine.selectRenderState().elements)[0];
};

describe("sceneEditorLexical.store selectProjectData", () => {
  it("keeps dialogue run styles and drops legacy segment ids without stripping layout textStyle overrides", () => {
    const projectData = selectCanvasProjectData();
    const dialogueContent =
      projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions
        .dialogue.content;
    const conditionalTextStyleId =
      projectData.resources.layouts["layout-1"].elements[0][
        "$if runtime.skipMode == false"
      ].textStyleId;

    expect(dialogueContent[0]).toEqual({
      text: "Styled dialogue",
      textStyle: { fill: "#b45309" },
    });
    expect(projectData.resources.textStyles[conditionalTextStyleId]).toEqual(
      expect.objectContaining({
        align: "center",
      }),
    );
  });

  it("renders dialogue run styles through Route Engine", () => {
    expect(renderDialogueText(selectCanvasProjectData()).content).toEqual([
      { text: "Styled dialogue", textStyle: { fill: "#b45309" } },
      { text: " and " },
      { text: "bold", textStyle: { fontWeight: "bold" } },
      { text: "italic", textStyle: { fontStyle: "italic" } },
      { text: "underline", textStyle: { textDecoration: "underline" } },
    ]);
  });

  it("leaves out run styles Route Engine rejects, so the canvas still renders", () => {
    const projectData = selectCanvasProjectData({
      dialogueContent: [
        { text: "Named", textStyle: { fill: "red" } },
        { text: "Rgb", textStyle: { fill: "rgb(255, 0, 0)" } },
        { text: "Big", textStyle: { fontSize: 40, fontWeight: "bold" } },
        { text: "Short", textStyle: { fill: "#abc" } },
        { text: "Upper", textStyle: { fill: "#ABCDEF" } },
        { text: "Alpha", textStyle: { fill: "#b4530980" } },
        { text: "Number", textStyle: { fill: 0xb45309 } },
        { text: "Empty", textStyle: null },
      ],
    });

    expect(renderDialogueText(projectData).content).toEqual([
      { text: "Named" },
      { text: "Rgb" },
      { text: "Big", textStyle: { fontWeight: "bold" } },
      { text: "Short", textStyle: { fill: "#aabbcc" } },
      { text: "Upper", textStyle: { fill: "#ABCDEF" } },
      { text: "Alpha" },
      { text: "Number" },
      { text: "Empty" },
    ]);
  });
});
