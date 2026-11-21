import { describe, expect, it, vi } from "vitest";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { constructProjectData } from "../../src/internal/project/projection.js";

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const createRepositoryState = (lineActions) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
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
            "line-1": { id: "line-1", actions: lineActions },
            "line-2": { id: "line-2", actions: {} },
          }),
        },
      }),
    },
  }),
});

const autoAdvance = (delay) => ({
  setNextLineConfig: {
    applyMode: "singleLine",
    manual: { enabled: true },
    auto: { enabled: true, trigger: "fromStart", delay },
  },
});

const selectLineActions = (projectData) =>
  projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions;

// Starts Route Engine on the first line with its own effects handler, which
// runs the line's Next Line Config timer on the given ticker.
const startRouteEngine = (projectData) => {
  let engine;
  const tickerCallbacks = new Set();
  const ticker = {
    add: (callback) => tickerCallbacks.add(callback),
    remove: (callback) => tickerCallbacks.delete(callback),
  };
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: { render: vi.fn() },
    ticker,
    persistence: { applyScopedDataUpdates: vi.fn() },
  });
  engine = createRouteEngine({
    handlePendingEffects: (effects) => {
      effectsHandler(effects);
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      }
    },
  });
  engine.init({ initialState: { global: {}, projectData } });
  const tick = (deltaMS) => {
    for (const callback of [...tickerCallbacks]) {
      callback({ deltaMS });
    }
  };
  return { engine, tick };
};

const selectCurrentLineId = (engine) =>
  engine.selectSystemState().contexts.at(-1).pointers.read.lineId;

describe("Next Line Config delays in Route Engine project data", () => {
  it("shows that Route Engine rejects a negative delay", () => {
    const projectData = constructProjectData(createRepositoryState({}));
    selectLineActions(projectData).setNextLineConfig =
      autoAdvance(-500).setNextLineConfig;

    expect(() => startRouteEngine(projectData)).toThrow(
      "authored delay must be a finite non-negative number",
    );
  });

  it("projects a saved negative delay as 0 without changing the project", () => {
    const state = createRepositoryState(autoAdvance(-500));
    const saved = structuredClone(state);

    const projectData = constructProjectData(state);

    expect(selectLineActions(projectData).setNextLineConfig.auto).toEqual({
      enabled: true,
      trigger: "fromStart",
      delay: 0,
    });
    const { engine, tick } = startRouteEngine(projectData);
    expect(selectCurrentLineId(engine)).toBe("line-1");
    tick(16);
    expect(selectCurrentLineId(engine)).toBe("line-2");
    expect(state).toEqual(saved);
  });

  it("keeps a delay of 0 or more", () => {
    const projectData = constructProjectData(
      createRepositoryState(autoAdvance(250)),
    );

    expect(selectLineActions(projectData).setNextLineConfig.auto.delay).toBe(
      250,
    );
    const { engine, tick } = startRouteEngine(projectData);
    tick(200);
    expect(selectCurrentLineId(engine)).toBe("line-1");
    tick(100);
    expect(selectCurrentLineId(engine)).toBe("line-2");
  });
});
