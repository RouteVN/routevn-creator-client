import { describe, expect, it, vi } from "vitest";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { createPlayerStartupEffects } from "../../scripts/playerStartupEffects.js";

const createPlayer = (actions = {}) => {
  const projectData = {
    screen: { width: 1280, height: 720 },
    resources: {
      images: { opening: { fileId: "image-one", width: 64, height: 32 } },
      layouts: {},
      sounds: {},
      variables: {
        visits: { type: "number", scope: "device", default: 0 },
        roll: { type: "number", scope: "context", default: 0 },
      },
    },
    story: {
      initialSceneId: "scene-one",
      scenes: {
        "scene-one": {
          initialSectionId: "section-one",
          sections: {
            "section-one": {
              lines: [
                { id: "line-one", actions },
                { id: "line-two", actions: {} },
              ],
            },
          },
        },
      },
    },
  };
  let engine;
  const render = vi.fn();
  const persist = vi.fn();
  const callbacks = new Set();
  const ticker = {
    add: vi.fn((callback) => callbacks.add(callback)),
    remove: vi.fn((callback) => callbacks.delete(callback)),
  };
  const randomSource = { nextUint32: vi.fn(() => 16) };
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: { render },
    ticker,
    persistence: { applyScopedDataUpdates: persist },
  });
  const startupEffects = createPlayerStartupEffects({
    getEngine: () => engine,
    effectsHandler,
  });
  engine = createRouteEngine({
    handlePendingEffects: startupEffects,
    randomSource,
  });
  engine.init({ initialState: { projectData } });
  return { engine, startupEffects, render, persist, ticker, randomSource };
};

describe("player startup effects", () => {
  it("handles only the latest entered-line effect in a batch", () => {
    const handleLineActions = vi.fn();
    const effectsHandler = vi.fn();
    const startupEffects = createPlayerStartupEffects({
      getEngine: () => ({ handleLineActions }),
      effectsHandler,
    });
    startupEffects([
      { name: "handleLineActions", payload: { marker: "older" } },
      { name: "render" },
      { name: "handleLineActions", payload: { marker: "newer" } },
    ]);
    expect(handleLineActions).toHaveBeenCalledExactlyOnceWith({
      marker: "newer",
    });
    expect(effectsHandler).not.toHaveBeenCalled();
  });

  it("resolves opening assets once, deferring rendering, persistence, and timers until start", async () => {
    const { engine, startupEffects, render, persist, ticker, randomSource } =
      createPlayer({
        background: { resourceId: "opening", resourceType: "image" },
        random: {
          distribution: { type: "integer", min: 1, max: 20 },
          variableId: "roll",
        },
        updateVariable: {
          id: "countVisit",
          operations: [{ variableId: "visits", op: "increment", value: 1 }],
        },
        setNextLineConfig: {
          auto: { enabled: true, trigger: "fromStart", delay: 1000 },
        },
      });

    expect(JSON.stringify(engine.selectRenderState())).toContain("image-one");
    await Promise.resolve();
    expect(render).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(ticker.add).not.toHaveBeenCalled();
    expect(randomSource.nextUint32).toHaveBeenCalledOnce();
    const openingLine =
      engine.selectSystemState().contexts[0].pointers.read.lineId;

    startupEffects.start();
    await vi.waitFor(() =>
      expect(
        persist.mock.calls
          .flatMap(([updates]) => updates)
          .filter((update) => update.path === "variables.visits"),
      ).toEqual([
        { scope: "device", path: "variables.visits", op: "set", value: 1 },
      ]),
    );
    expect(render).toHaveBeenCalledOnce();
    expect(ticker.add).toHaveBeenCalledOnce();
    expect(randomSource.nextUint32).toHaveBeenCalledOnce();
    expect(engine.selectSystemState().global.variables.visits).toBe(1);
    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      openingLine,
    );
    startupEffects.start();
    expect(render).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it("renders an empty opening line and forwards normal effects after start", () => {
    const { engine, startupEffects, render } = createPlayer();
    expect(render).not.toHaveBeenCalled();
    startupEffects.start();
    expect(render).toHaveBeenCalledOnce();
    engine.handleInternalAction("markLineCompleted");
    const renderCount = render.mock.calls.length;
    engine.handleAction("nextLine");
    expect(render.mock.calls.length).toBeGreaterThan(renderCount);
    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "line-two",
    );
    engine.dispose();
  });
});
