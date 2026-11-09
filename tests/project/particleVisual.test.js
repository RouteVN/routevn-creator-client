// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import { extractFileIdsForScenes } from "../../src/internal/project/layout.js";
import { constructProjectData } from "../../src/internal/project/projection.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";

let parseElements;

beforeAll(async () => {
  // The graphics bundle also imports audio workers; parsing uses no workers.
  vi.stubGlobal("Worker", class {});
  const { containerPlugin, particlesPlugin, rectPlugin, spritePlugin } =
    await import("route-graphics");
  const parserPlugins = [
    containerPlugin,
    particlesPlugin,
    rectPlugin,
    spritePlugin,
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

// A particle as the Particles page saves it, drawn with an image texture.
const createParticle = () => {
  const particle = createParticlePreset({
    projectResolution: { width: 1920, height: 1080 },
  });
  particle.modules.appearance.texture = "flake-image";
  return particle;
};

const createRepositoryState = () => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
  images: createTreeCollection({
    "flake-image": {
      id: "flake-image",
      type: "image",
      name: "Flake",
      fileId: "flake-file",
      fileType: "image/png",
      width: 32,
      height: 32,
    },
  }),
  particles: createTreeCollection({
    snow: { id: "snow", ...createParticle() },
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
              actions: {
                visual: {
                  items: [
                    {
                      id: "snowfall",
                      resourceId: "snow",
                      resourceType: "particle",
                      transformId: "center",
                      layer: 50,
                    },
                  ],
                },
              },
            },
          }),
        },
      }),
    },
  }),
});

describe("a particle used as a visual", () => {
  it("renders as a particle effect through Route Engine and Route Graphics", () => {
    const projectData = constructProjectData(createRepositoryState());
    const engine = createRouteEngine({ handlePendingEffects() {} });
    engine.init({ initialState: { global: {}, projectData } });
    const elements = parseElements(engine.selectRenderState().elements);

    // The center transform anchors the 1920x1080 effect at the middle of
    // the screen, so its top-left corner lands at the origin.
    expect(findElement(elements, "visual-snowfall")).toMatchObject({
      type: "container",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(findElement(elements, "visual-snowfall-particles")).toMatchObject({
      type: "particles",
      width: 1920,
      height: 1080,
      texture: "flake-file",
    });
  });

  it("loads the particle's texture image with the scene", () => {
    const projectData = constructProjectData(createRepositoryState());

    expect(
      extractFileIdsForScenes(projectData, ["scene-1"]).map(({ url }) => url),
    ).toContain("flake-file");
  });
});
