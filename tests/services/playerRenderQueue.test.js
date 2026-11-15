import { describe, expect, it, vi } from "vitest";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { createPlayerRenderQueue } from "../../scripts/playerRenderQueue.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

const flushPromises = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// A stand-in for the bundle asset loader: every asset stays missing until the
// test finishes its load.
const createAssetLoader = () => {
  const loaded = new Set();
  const loads = new Map();

  const getLoad = (assetId) => {
    if (!loads.has(assetId)) {
      loads.set(assetId, deferred());
    }
    return loads.get(assetId);
  };

  return {
    collectMissingAssetIds: (renderState) =>
      (renderState.assetIds ?? []).filter((assetId) => !loaded.has(assetId)),
    ensureAssetsLoaded: vi.fn(async (assetIds) => {
      await Promise.all(
        assetIds.map(async (assetId) => {
          await getLoad(assetId).promise;
          loaded.add(assetId);
        }),
      );
    }),
    finishLoad: async (assetId) => {
      getLoad(assetId).resolve();
      await flushPromises();
    },
    failLoad: async (assetId, error) => {
      getLoad(assetId).reject(error);
      await flushPromises();
    },
  };
};

const createQueue = () => {
  const assets = createAssetLoader();
  const render = vi.fn();
  const onAssetLoadStart = vi.fn();
  const onAssetLoadError = vi.fn();
  const queue = createPlayerRenderQueue({
    collectMissingAssetIds: assets.collectMissingAssetIds,
    ensureAssetsLoaded: assets.ensureAssetsLoaded,
    render,
    onAssetLoadStart,
    onAssetLoadError,
  });
  const renderedIds = () => render.mock.calls.map(([state]) => state.id);

  return {
    assets,
    queue,
    render,
    renderedIds,
    onAssetLoadStart,
    onAssetLoadError,
  };
};

describe("player render queue", () => {
  it("renders a state at once when its assets are loaded", () => {
    const { queue, renderedIds, assets } = createQueue();

    queue.enqueue({ id: "one" });

    expect(renderedIds()).toEqual(["one"]);
    expect(queue.hasWaitingStates()).toBe(false);
    expect(assets.ensureAssetsLoaded).not.toHaveBeenCalled();
  });

  it("holds a state until its assets load", async () => {
    const { queue, renderedIds, assets, onAssetLoadStart } = createQueue();

    queue.enqueue({ id: "one", assetIds: ["music-one"] });

    expect(renderedIds()).toEqual([]);
    expect(queue.hasWaitingStates()).toBe(true);
    expect(onAssetLoadStart).toHaveBeenCalledExactlyOnceWith({
      assetIds: ["music-one"],
    });

    await assets.finishLoad("music-one");

    expect(renderedIds()).toEqual(["one"]);
    expect(queue.hasWaitingStates()).toBe(false);
  });

  it("renders every waiting state, in order, instead of only the latest", async () => {
    const { queue, renderedIds, assets } = createQueue();

    queue.enqueue({ id: "one", assetIds: ["music-one"] });
    queue.enqueue({ id: "two", assetIds: ["music-two"] });
    queue.enqueue({ id: "three" });

    // The later states are ready first, and still wait for the one before.
    await assets.finishLoad("music-two");
    expect(renderedIds()).toEqual([]);
    expect(queue.hasWaitingStates()).toBe(true);

    await assets.finishLoad("music-one");
    expect(renderedIds()).toEqual(["one", "two", "three"]);
    expect(queue.hasWaitingStates()).toBe(false);
  });

  it("keeps a ready state behind the states that still wait", async () => {
    const { queue, renderedIds, assets } = createQueue();

    queue.enqueue({ id: "one", assetIds: ["music-one"] });
    queue.enqueue({ id: "two" });

    expect(renderedIds()).toEqual([]);
    await assets.finishLoad("music-one");
    expect(renderedIds()).toEqual(["one", "two"]);
  });

  it("renders at once again after the waiting states are drawn", async () => {
    const { queue, renderedIds, assets } = createQueue();

    queue.enqueue({ id: "one", assetIds: ["music-one"] });
    await assets.finishLoad("music-one");
    queue.enqueue({ id: "two", assetIds: ["music-one"] });

    expect(renderedIds()).toEqual(["one", "two"]);
  });

  it("reports a failed load once and renders nothing after it", async () => {
    const { queue, renderedIds, assets, onAssetLoadError } = createQueue();
    const error = new Error("Asset unavailable");

    queue.enqueue({ id: "one", assetIds: ["music-one"] });
    queue.enqueue({ id: "two", assetIds: ["music-two"] });
    await assets.failLoad("music-one", error);

    expect(onAssetLoadError).toHaveBeenCalledExactlyOnceWith(error, {
      assetIds: ["music-one"],
    });
    expect(queue.hasWaitingStates()).toBe(false);

    await assets.finishLoad("music-two");
    queue.enqueue({ id: "three" });

    expect(renderedIds()).toEqual([]);
    expect(onAssetLoadError).toHaveBeenCalledOnce();
  });
});

const FADE_EFFECT = {
  name: "Fade",
  type: "transition",
  prev: {
    volume: {
      keyframes: [{ value: 0, duration: 1000, easing: "easeInOutSine" }],
    },
  },
  next: {
    volume: {
      initialValue: 0,
      keyframes: [{ value: 100, duration: 1000, easing: "easeInOutSine" }],
    },
  },
};

const createBgm = (soundId) => ({
  interruption: "immediate",
  loop: true,
  volume: 75,
  sounds: [
    {
      id: soundId,
      resourceId: soundId,
      loop: false,
      volume: 100,
      startDelayMs: 0,
    },
  ],
});

const createFadedBgm = (soundId) => ({
  ...createBgm(soundId),
  audioEffects: { resourceId: "fade", playback: { speed: 1 } },
});

const createSection = (bgm) => ({
  lines: [
    { id: `${bgm.sounds[0].id}-line-one`, actions: { bgm } },
    { id: `${bgm.sounds[0].id}-line-two`, actions: {} },
  ],
});

// A menu whose choices lead to sections that each fade to their own music.
const createMusicProject = () => ({
  screen: { width: 1280, height: 720 },
  resources: {
    layouts: {},
    variables: {},
    sounds: {
      "menu-music": { fileId: "menu-music-file", fileType: "audio/ogg" },
      "music-one": { fileId: "music-one-file", fileType: "audio/ogg" },
      "music-two": { fileId: "music-two-file", fileType: "audio/ogg" },
    },
    audioEffects: { fade: FADE_EFFECT },
  },
  story: {
    initialSceneId: "scene-one",
    scenes: {
      "scene-one": {
        initialSectionId: "menu",
        sections: {
          menu: createSection(createBgm("menu-music")),
          "section-one": createSection(createFadedBgm("music-one")),
          "section-two": createSection(createFadedBgm("music-two")),
        },
      },
    },
  },
});

const collectAudioNodeIds = (renderState) => {
  const ids = new Set();
  const visit = (nodes = []) => {
    for (const node of nodes) {
      ids.add(node.id);
      visit(node.children);
    }
  };
  visit(renderState?.audio);
  return ids;
};

// The renderer rejects an audio effect whose target is in neither the state it
// drew last nor the new one.
const findUnresolvedAudioEffects = (renderedStates) => {
  const unresolved = [];
  renderedStates.forEach((renderState, index) => {
    const previousIds = collectAudioNodeIds(renderedStates[index - 1]);
    const nextIds = collectAudioNodeIds(renderState);
    for (const effect of renderState.audioEffects ?? []) {
      if (!previousIds.has(effect.targetId) && !nextIds.has(effect.targetId)) {
        unresolved.push({ index, targetId: effect.targetId });
      }
    }
  });
  return unresolved;
};

const createMusicPlayer = () => {
  const projectData = createMusicProject();
  const fileIds = new Set(
    Object.values(projectData.resources.sounds).map((sound) => sound.fileId),
  );
  const assets = createAssetLoader();
  const loadedFileIds = new Set();
  const renderedStates = [];
  const queue = createPlayerRenderQueue({
    collectMissingAssetIds: (renderState) => {
      const text = JSON.stringify(renderState);
      return [...fileIds].filter(
        (fileId) => text.includes(fileId) && !loadedFileIds.has(fileId),
      );
    },
    ensureAssetsLoaded: async (assetIds) => {
      await assets.ensureAssetsLoaded(assetIds);
      assetIds.forEach((assetId) => loadedFileIds.add(assetId));
    },
    render: (renderState) => renderedStates.push(renderState),
  });

  let engine;
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: { render: (renderState) => queue.enqueue(renderState) },
    ticker: { add: () => {}, remove: () => {} },
    persistence: { applyScopedDataUpdates: () => {} },
  });
  engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  engine.init({ initialState: { projectData } });

  const choose = (sectionId) => {
    engine.handleActions({
      sectionTransition: { sceneId: "scene-one", sectionId },
    });
  };
  const playedSoundIds = () =>
    renderedStates.map((renderState) =>
      [...collectAudioNodeIds(renderState)]
        .filter((id) => id.startsWith("bgm:"))
        .join(","),
    );

  return { assets, queue, renderedStates, choose, playedSoundIds };
};

describe("player render queue with the engine", () => {
  it("keeps the music effects valid when a second choice is made before the first one is drawn", async () => {
    const { assets, queue, renderedStates, choose, playedSoundIds } =
      createMusicPlayer();
    await assets.finishLoad("menu-music-file");
    expect(playedSoundIds()).toEqual(["bgm:menu-music"]);

    choose("section-one");
    expect(queue.hasWaitingStates()).toBe(true);
    choose("section-two");
    await assets.finishLoad("music-two-file");
    await assets.finishLoad("music-one-file");

    expect(queue.hasWaitingStates()).toBe(false);
    expect(playedSoundIds().at(-1)).toBe("bgm:music-two");
    expect(playedSoundIds()).toContain("bgm:music-one");
    // The last state fades out the first choice's music, so that music has to
    // have been drawn first.
    expect(
      renderedStates.at(-1).audioEffects.map((effect) => effect.targetId),
    ).toContain("bgm:music-one");
    expect(findUnresolvedAudioEffects(renderedStates)).toEqual([]);
  });

  it("draws a single choice once its music is loaded", async () => {
    const { assets, renderedStates, choose, playedSoundIds } =
      createMusicPlayer();
    await assets.finishLoad("menu-music-file");

    choose("section-one");
    await assets.finishLoad("music-one-file");

    expect(playedSoundIds().at(-1)).toBe("bgm:music-one");
    expect(findUnresolvedAudioEffects(renderedStates)).toEqual([]);
  });
});
