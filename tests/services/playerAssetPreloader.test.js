import { describe, expect, it, vi } from "vitest";
import {
  createPlayerAssetPreloader,
  MAX_PRELOAD_ATTEMPTS,
} from "../../scripts/playerAssetPreloader.js";

const flushPromises = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// Every load stays open until the test finishes or fails it.
const createPreloader = () => {
  const loads = new Map();
  const started = [];
  const state = { canLoad: true };
  const onError = vi.fn();
  const preloader = createPlayerAssetPreloader({
    loadAsset: (assetId) =>
      new Promise((resolve, reject) => {
        started.push(assetId);
        loads.set(assetId, { resolve, reject });
      }),
    canLoad: () => state.canLoad,
    onError,
    schedule: (run) => run(),
  });

  return {
    preloader,
    started,
    state,
    onError,
    finish: async (assetId) => {
      loads.get(assetId).resolve();
      await flushPromises();
    },
    fail: async (assetId, error) => {
      loads.get(assetId).reject(error);
      await flushPromises();
    },
  };
};

describe("createPlayerAssetPreloader", () => {
  it("loads the plan in order, one asset at a time", async () => {
    const { preloader, started, finish } = createPreloader();

    preloader.setPlan(["a", "b", "c"]);
    expect(started).toEqual(["a"]);

    await finish("a");
    expect(started).toEqual(["a", "b"]);

    await finish("b");
    await finish("c");
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("does not start a load while a screen waits for its assets", async () => {
    const { preloader, started, state, finish } = createPreloader();

    state.canLoad = false;
    preloader.setPlan(["a", "b"]);
    expect(started).toEqual([]);

    state.canLoad = true;
    preloader.setPlan(["a", "b"]);
    expect(started).toEqual(["a"]);

    state.canLoad = false;
    await finish("a");
    expect(started).toEqual(["a"]);
  });

  it("drops queued assets that a new plan no longer lists", async () => {
    const { preloader, started, finish } = createPreloader();

    preloader.setPlan(["a", "b", "c"]);
    preloader.setPlan(["d"]);
    await finish("a");

    expect(started).toEqual(["a", "d"]);
  });

  it("skips a failed asset and goes on with the queue", async () => {
    const { preloader, started, onError, fail } = createPreloader();
    const error = new Error("unreadable");

    preloader.setPlan(["a", "b"]);
    await fail("a", error);

    expect(onError).toHaveBeenCalledWith(error, { assetId: "a" });
    expect(started).toEqual(["a", "b"]);
    expect(preloader.hasGivenUp("a")).toBe(false);
  });

  it("tries a failed asset again when a later plan lists it", async () => {
    const { preloader, started, fail, finish } = createPreloader();

    preloader.setPlan(["a"]);
    await fail("a", new Error("read failed once"));
    preloader.setPlan(["a"]);
    expect(started).toEqual(["a", "a"]);

    await finish("a");
    expect(preloader.hasGivenUp("a")).toBe(false);
  });

  it("gives up on an asset that keeps failing", async () => {
    const { preloader, started, onError, fail } = createPreloader();

    for (let attempt = 1; attempt <= MAX_PRELOAD_ATTEMPTS; attempt++) {
      expect(preloader.hasGivenUp("a")).toBe(false);
      preloader.setPlan(["a"]);
      await fail("a", new Error("unreadable"));
    }

    expect(preloader.hasGivenUp("a")).toBe(true);
    expect(onError).toHaveBeenCalledTimes(MAX_PRELOAD_ATTEMPTS);

    preloader.setPlan(["a", "b"]);
    expect(started).toEqual([...Array(MAX_PRELOAD_ATTEMPTS).fill("a"), "b"]);
  });

  it("counts failures in a row only", async () => {
    const { preloader, fail, finish } = createPreloader();

    for (let round = 0; round < MAX_PRELOAD_ATTEMPTS; round++) {
      preloader.setPlan(["a"]);
      await fail("a", new Error("read failed"));
      preloader.setPlan(["a"]);
      await finish("a");
    }

    expect(preloader.hasGivenUp("a")).toBe(false);
  });
});
