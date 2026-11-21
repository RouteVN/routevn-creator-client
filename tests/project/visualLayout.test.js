// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  extractFileIdsForScenes,
  extractFileIdsForValue,
} from "../../src/internal/project/layout.js";
import {
  constructProjectData,
  createVisualLayoutBuilder,
  recursivelyCheckResource,
  toStoredVisualPresentationState,
} from "../../src/internal/project/projection.js";

let parseElements;

beforeAll(async () => {
  // The graphics bundle also imports audio workers; parsing uses no workers.
  vi.stubGlobal("Worker", class {});
  const { containerPlugin, rectPlugin, spritePlugin } = await import(
    "route-graphics"
  );
  const parserPlugins = [containerPlugin, rectPlugin, spritePlugin];
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

const findElement = (elements, matches) => {
  for (const element of elements ?? []) {
    if (matches(element)) return element;
    const child = findElement(element.children, matches);
    if (child) return child;
  }
};

const byId = (id) => (element) => element.id === id;
const byIdSuffix = (suffix) => (element) => element.id.endsWith(suffix);

const createImage = (id, width, height) => ({
  id,
  type: "image",
  name: id,
  fileId: `${id}-file`,
  fileType: "image/png",
  width,
  height,
});

// A visual whose layout holds one image, as the migration writes it: the
// canvas is the image's size.
const createImageLayout = (imageId, width, height) => ({
  layoutSchemaVersion: 2,
  width,
  height,
  elements: createTreeCollection({
    content: {
      type: "sprite",
      name: "Door",
      imageId,
      x: 0,
      y: 0,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      width,
      height,
    },
  }),
});

// A layout of one element, as the layout editor saves it.
const createElementLayout = (element) => ({
  layoutSchemaVersion: 2,
  elements: createTreeCollection({ content: element }),
});

const createRepositoryState = (visualItems) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
  videos: createTreeCollection({
    clip: {
      id: "clip",
      type: "video",
      name: "Clip",
      fileId: "clip-file",
      fileType: "video/mp4",
      width: 640,
      height: 360,
    },
  }),
  sounds: createTreeCollection({
    blip: {
      id: "blip",
      type: "sound",
      name: "Blip",
      fileId: "blip-file",
      fileType: "audio/mpeg",
    },
    tap: {
      id: "tap",
      type: "sound",
      name: "Tap",
      fileId: "tap-file",
      fileType: "audio/mpeg",
    },
  }),
  images: createTreeCollection({
    door: createImage("door", 400, 600),
    button: createImage("button", 200, 80),
    "button-hover": createImage("button-hover", 200, 80),
    "button-down": createImage("button-down", 200, 80),
  }),
  transforms: createTreeCollection({
    center: {
      id: "center",
      type: "transform",
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
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
            "line-1": {
              id: "line-1",
              actions: { visual: { items: visualItems } },
            },
          }),
        },
      }),
    },
  }),
});

// Builds the line's render state the way the scene editor does.
const renderLine = (repositoryState) => {
  const projectData = constructProjectData(repositoryState);
  const engine = createRouteEngine({ handlePendingEffects() {} });
  engine.init({ initialState: { global: {}, projectData } });
  return parseElements(engine.selectRenderState().elements);
};

const getBounds = ({ x, y, width, height }) => ({ x, y, width, height });

describe("a visual made of a layout", () => {
  it("draws an image visual's layout where the image visual was drawn", () => {
    const imageVisual = findElement(
      renderLine(
        createRepositoryState([
          {
            id: "door",
            resourceId: "door",
            resourceType: "image",
            transformId: "center",
            layer: 50,
          },
        ]),
      ),
      byId("visual-door"),
    );
    const layoutVisual = findElement(
      renderLine(
        createRepositoryState([
          {
            id: "door",
            layout: createImageLayout("door", 400, 600),
            transformId: "center",
            layer: 50,
          },
        ]),
      ),
      byId("visual-door"),
    );

    expect(getBounds(imageVisual)).toEqual({
      x: 760,
      y: 240,
      width: 400,
      height: 600,
    });
    expect(layoutVisual.type).toBe("container");
    expect(getBounds(layoutVisual)).toEqual(getBounds(imageVisual));
  });

  it("draws every element in the visual's container, with hover and click images", () => {
    const elements = renderLine(
      createRepositoryState([
        {
          id: "card",
          layout: {
            layoutSchemaVersion: 2,
            elements: {
              items: {
                background: {
                  type: "sprite",
                  name: "Background",
                  imageId: "door",
                  x: 0,
                  y: 0,
                  width: 400,
                  height: 600,
                },
                look: {
                  type: "sprite",
                  name: "Look",
                  imageId: "button",
                  hoverImageId: "button-hover",
                  clickImageId: "button-down",
                  x: 100,
                  y: 500,
                  width: 200,
                  height: 80,
                },
              },
              tree: [{ id: "background" }, { id: "look" }],
            },
          },
          transformId: "center",
          layer: 70,
          opacity: 0.5,
        },
      ]),
    );

    // Without a size, the canvas is the screen and the centred transform
    // keeps the elements where they were placed.
    const container = findElement(elements, byId("visual-card"));
    expect(container).toMatchObject({
      type: "container",
      alpha: 0.5,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(container.children.map((child) => child.type)).toEqual([
      "sprite",
      "sprite",
    ]);
    expect(findElement(container.children, byIdSuffix("look"))).toMatchObject({
      src: "button-file",
      hover: { src: "button-hover-file" },
      click: { src: "button-down-file" },
    });
  });

  it("loads the images in a visual's layout with the scene", () => {
    const projectData = constructProjectData(
      createRepositoryState([
        {
          id: "door",
          layout: createImageLayout("door", 400, 600),
          transformId: "center",
          layer: 50,
        },
      ]),
    );

    expect(
      extractFileIdsForScenes(projectData, ["scene-1"]).map(({ url }) => url),
    ).toContain("door-file");
  });

  // A visual's layout is built in its line, where a video, a particle's
  // texture and a sound are named by their files. The preview and an
  // exported game load a scene's files from this list.
  it.each([
    [
      "video",
      { type: "video", name: "Clip", videoId: "clip", x: 0, y: 0 },
      ["clip-file"],
    ],
    [
      "hover and click sounds",
      {
        type: "sprite",
        name: "Look",
        imageId: "button",
        hoverSoundId: "blip",
        clickSoundId: "tap",
        x: 0,
        y: 0,
        width: 200,
        height: 80,
      },
      ["button-file", "blip-file", "tap-file"],
    ],
  ])(
    "loads the %s in a visual's layout with the scene and with its line",
    (_name, element, fileIds) => {
      const projectData = constructProjectData(
        createRepositoryState([
          { id: "card", layout: createElementLayout(element), layer: 50 },
        ]),
      );
      const [line] =
        projectData.story.scenes["scene-1"].sections["section-1"].lines;

      expect(
        extractFileIdsForScenes(projectData, ["scene-1"]).map(({ url }) => url),
      ).toEqual(expect.arrayContaining(fileIds));
      expect(
        extractFileIdsForValue(projectData, line).map(({ url }) => url),
      ).toEqual(expect.arrayContaining(fileIds));
    },
  );

  it("loads a video in a visual's layout as a video", () => {
    const projectData = constructProjectData(
      createRepositoryState([
        {
          id: "card",
          layout: createElementLayout({
            type: "video",
            name: "Clip",
            videoId: "clip",
            x: 0,
            y: 0,
          }),
          layer: 50,
        },
      ]),
    );

    expect(extractFileIdsForScenes(projectData, ["scene-1"])).toContainEqual({
      url: "clip-file",
      type: "video/mp4",
    });
  });

  it("keeps an image used in a visual's layout from being deleted", () => {
    expect(
      recursivelyCheckResource({
        state: createRepositoryState([
          {
            id: "door",
            layout: createImageLayout("door", 400, 600),
            transformId: "center",
            layer: 50,
          },
        ]),
        itemId: "door",
        checkTargets: ["scenes"],
      }).isUsed,
    ).toBe(true);
  });

  it("builds only the stored layouts and leaves other actions as they are", () => {
    const builder = createVisualLayoutBuilder(createRepositoryState([]));
    const actions = {
      dialogue: { content: [{ text: "Hello" }] },
      visual: {
        items: [
          { id: "door", resourceId: "door", resourceType: "image" },
          { id: "card", layout: createImageLayout("door", 400, 600) },
          { id: "moved", transformId: "center" },
        ],
      },
    };

    const { actions: built } = builder.buildActions(actions);

    expect(built.dialogue).toBe(actions.dialogue);
    expect(built.visual.items[0]).toBe(actions.visual.items[0]);
    expect(built.visual.items[2]).toBe(actions.visual.items[2]);
    expect(Array.isArray(built.visual.items[1].layout.elements)).toBe(true);
    expect(built.visual.items[1].layout).toMatchObject({
      width: 400,
      height: 600,
    });
    expect(built.visual.items[1].layout).not.toHaveProperty(
      "layoutSchemaVersion",
    );
    // The saved actions are not changed.
    expect(actions.visual.items[1].layout.elements.items).toBeDefined();
  });

  it("gives the scene editor back the saved layout from the engine's presentation state", () => {
    const layout = createImageLayout("door", 400, 600);
    const repositoryState = createRepositoryState([{ id: "card", layout }]);
    const presentLine = (options) => {
      const engine = createRouteEngine({ handlePendingEffects() {} });
      engine.init({
        initialState: {
          global: {},
          projectData: constructProjectData(repositoryState, options),
        },
      });
      return engine.selectPresentationState();
    };

    // The engine is given the built layout, and keeps the saved one with it.
    const editorState = presentLine({ keepStoredVisualLayouts: true });
    const [shownItem] = editorState.visual.items;
    expect(Array.isArray(shownItem.layout.elements)).toBe(true);
    expect(shownItem.layout.source).toEqual(layout);
    expect(
      toStoredVisualPresentationState(editorState).visual.items[0],
    ).toEqual({ id: "card", layout });

    // Elsewhere, as in an exported game, the built layout is all there is.
    const [exportedItem] = presentLine().visual.items;
    expect(exportedItem.layout).not.toHaveProperty("source");
    expect(toStoredVisualPresentationState(presentLine())).toEqual(
      presentLine(),
    );
  });

  it("draws a visual the same when its saved layout is kept with it", () => {
    const repositoryState = createRepositoryState([
      { id: "card", layout: createImageLayout("door", 400, 600) },
    ]);
    const draw = (options) => {
      const engine = createRouteEngine({ handlePendingEffects() {} });
      engine.init({
        initialState: {
          global: {},
          projectData: constructProjectData(repositoryState, options),
        },
      });
      return engine.selectRenderState().elements;
    };

    expect(draw({ keepStoredVisualLayouts: true })).toEqual(draw());
  });
});
