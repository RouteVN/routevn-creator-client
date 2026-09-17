import { buildLayoutElements } from "../../src/internal/project/layout.js";

export const NVL_LINE_TEXT = [
  "First line stays visible while the next line reveals.",
  "Second line reveals without restarting the first line.",
  "Third line reveals while both previous lines stay visible.",
  "A new page starts with only this line revealing.",
];

export const createNvlDialogueProject = (revealEffect) => {
  const emptyCollection = { items: {}, tree: [] };
  const { elements } = buildLayoutElements(
    [
      {
        id: "nvl-lines",
        type: "container",
        x: 20,
        y: 20,
        direction: "vertical",
        gapY: 20,
        children: [
          {
            id: "nvl-line",
            type: "container-ref-dialogue-line",
            height: 80,
            children: [
              {
                id: "line-body",
                type: "container",
                children: [
                  {
                    id: "line-text",
                    type: "text-revealing",
                    text: "${line.content[0].text}",
                    revealEffect,
                    width: 700,
                    textStyle: { fontSize: 24, fill: "#ffffff" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    {},
    emptyCollection,
    emptyCollection,
    emptyCollection,
    { layoutId: "nvl", layoutType: "dialogue-nvl" },
  );

  return {
    screen: { width: 800, height: 500 },
    resources: { layouts: { nvl: { elements } } },
    story: {
      initialSceneId: "scene-1",
      scenes: {
        "scene-1": {
          initialSectionId: "section-1",
          sections: {
            "section-1": {
              lines: NVL_LINE_TEXT.map((text, index) => ({
                id: `line-${index + 1}`,
                actions: {
                  dialogue: {
                    mode: "nvl",
                    ui: { resourceId: "nvl" },
                    textSpeed: 0,
                    clearPage: index === 3,
                    content: [{ text }],
                  },
                },
              })),
            },
          },
        },
      },
    },
  };
};
