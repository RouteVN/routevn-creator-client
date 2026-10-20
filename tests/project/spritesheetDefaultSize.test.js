// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import { constructProjectData } from "../../src/internal/project/projection.js";
import { normalizeSpritesheetAtlas } from "../../src/internal/spritesheetAtlas.js";

let parseElements;

beforeAll(async () => {
  // The graphics bundle also imports audio workers; parsing uses no workers.
  vi.stubGlobal("Worker", class {});
  const {
    containerPlugin,
    rectPlugin,
    spritePlugin,
    spritesheetAnimationPlugin,
  } = await import("route-graphics");
  const parserPlugins = [
    containerPlugin,
    rectPlugin,
    spritePlugin,
    spritesheetAnimationPlugin,
  ];
  parseElements = (elements) =>
    elements.map((state) =>
      parserPlugins
        .find((plugin) => plugin.type === state.type)
        .parse({ state, parserPlugins }),
    );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const findElement = (elements, id) => {
  for (const element of elements ?? []) {
    if (element.id === id) return element;
    const child = findElement(element.children, id);
    if (child) return child;
  }
};

// A spritesheet as the Spritesheets page saves it with the Default Width and
// Height fields left empty: two 256x512 frames on a 512x512 sheet.
const createSpritesheet = (fields = {}) => ({
  type: "spritesheet",
  name: "Walk",
  fileId: "walk-file",
  jsonData: normalizeSpritesheetAtlas({
    frames: {
      "walk-0": {
        frame: { x: 0, y: 0, w: 256, h: 512 },
        sourceSize: { w: 256, h: 512 },
      },
      "walk-1": {
        frame: { x: 256, y: 0, w: 256, h: 512 },
        sourceSize: { w: 256, h: 512 },
      },
    },
    meta: { size: { w: 512, h: 512 } },
  }),
  animations: { walk: { frames: [0, 1], fps: 12, loop: true } },
  sheetWidth: 512,
  sheetHeight: 512,
  frameCount: 2,
  ...fields,
});

const createRepositoryState = ({ spritesheet, actions }) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
  spritesheets: createTreeCollection({
    walk: { id: "walk", ...spritesheet },
  }),
  characters: createTreeCollection({
    hero: {
      id: "hero",
      type: "character",
      name: "Hero",
      sprites: createTreeCollection({
        "hero-walk": { id: "hero-walk", ...spritesheet },
      }),
    },
  }),
  transforms: createTreeCollection({
    center: {
      id: "center",
      type: "transform",
      x: 960,
      y: 1080,
      anchorX: 0.5,
      anchorY: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  }),
  scenes: createTreeCollection({
    "scene-1": {
      id: "scene-1",
      type: "scene",
      name: "Scene 1",
      sections: createTreeCollection({
        "section-1": {
          id: "section-1",
          name: "Section 1",
          lines: createTreeCollection({
            "line-1": { id: "line-1", actions },
          }),
        },
      }),
    },
  }),
});

const USES = {
  background: {
    actions: { background: { resourceId: "walk" } },
    elementId: "bg-cg-background-spritesheet-animation",
  },
  visual: {
    actions: {
      visual: {
        items: [{ id: "walker", resourceId: "walk", transformId: "center" }],
      },
    },
    elementId: "visual-walker",
  },
  "character sprite": {
    actions: {
      character: {
        items: [
          {
            id: "hero",
            transformId: "center",
            sprites: [{ id: "body", resourceId: "hero-walk" }],
          },
        ],
      },
    },
    elementId: "character-container-hero-body",
  },
};

// Builds the line's render state the way the scene editor does, through the
// project data, Route Engine and Route Graphics' parsers.
const renderLine = (spritesheet, actions) => {
  const projectData = constructProjectData(
    createRepositoryState({ spritesheet, actions }),
  );
  const engine = createRouteEngine({ handlePendingEffects() {} });
  engine.init({ initialState: { global: {}, projectData } });
  return parseElements(engine.selectRenderState().elements);
};

describe("spritesheet default size in project data", () => {
  it("gives a spritesheet and a character spritesheet without one their first frame's size", () => {
    const { resources } = constructProjectData(
      createRepositoryState({
        spritesheet: createSpritesheet(),
        actions: USES.background.actions,
      }),
    );

    expect(resources.spritesheets.walk).toMatchObject({
      width: 256,
      height: 512,
    });
    expect(resources.spritesheets["hero-walk"]).toMatchObject({
      width: 256,
      height: 512,
    });
  });
});

describe.each(Object.entries(USES))(
  "a spritesheet used as a %s",
  (_use, { actions, elementId }) => {
    it("renders at its first frame's size when it has no default size", () => {
      // Without a size, Route Graphics threw "Input Error: Width or height is
      // missing" on every render of the line.
      const elements = renderLine(createSpritesheet(), actions);

      expect(findElement(elements, elementId)).toMatchObject({
        type: "spritesheet-animation",
        width: 256,
        height: 512,
      });
    });

    it("renders at its default size when it has one", () => {
      const elements = renderLine(
        createSpritesheet({ width: 128, height: 256 }),
        actions,
      );

      expect(findElement(elements, elementId)).toMatchObject({
        type: "spritesheet-animation",
        width: 128,
        height: 256,
      });
    });
  },
);
