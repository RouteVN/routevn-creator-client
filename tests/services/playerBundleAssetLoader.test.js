import { afterEach, describe, expect, it, vi } from "vitest";
import { createBundleAssetLoader } from "../../scripts/playerBundleAssetLoader.js";

// The first byte of a test asset stands for the type found in its bytes.
vi.mock("file-type", () => ({
  fileTypeFromBuffer: async (content) =>
    content[0] === 0x89 ? { mime: "image/png" } : undefined,
}));

const flushPromises = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const MANIFEST_ASSETS = {
  "picture-1": { mime: "image/png" },
  "picture-2": { mime: "image/webp" },
  "sound-1": { mime: "audio/ogg" },
  "font-1": { mime: "font/woff2" },
  // A picture the package lists under a generic type.
  "generic-1": { mime: "application/octet-stream", bytes: [0x89, 2, 3] },
};

// A graphics engine stand-in. Unloads stay open until the test finishes or
// fails them, so the order of a reload and an unload can be checked.
const createLoader = () => {
  const calls = [];
  const unloads = [];
  const reads = [];
  const routeGraphics = {
    loadAssets: vi.fn(async (assets) => {
      calls.push(`load ${Object.keys(assets).join()}`);
      return [];
    }),
    unloadAssets: vi.fn(
      (assetIds) =>
        new Promise((resolve, reject) => {
          calls.push(`unload ${assetIds.join()}`);
          unloads.push({
            finish: async () => {
              calls.push(`unloaded ${assetIds.join()}`);
              resolve(assetIds);
              await flushPromises();
            },
            fail: async (error) => {
              reject(error);
              await flushPromises();
            },
          });
        }),
    ),
  };
  const bundleReader = {
    manifest: { assets: MANIFEST_ASSETS },
    hasAsset: (assetId) => Object.hasOwn(MANIFEST_ASSETS, assetId),
    readAsset: vi.fn(async (assetId) => {
      reads.push(assetId);
      return {
        buffer: new Uint8Array(MANIFEST_ASSETS[assetId].bytes ?? [1, 2, 3]),
        mime: MANIFEST_ASSETS[assetId].mime,
      };
    }),
  };
  const recordDiagnosticStep = vi.fn();
  const loader = createBundleAssetLoader({
    bundleReader,
    routeGraphics,
    recordDiagnosticStep,
  });

  return {
    loader,
    calls,
    unloads,
    reads,
    routeGraphics,
    bundleReader,
    recordDiagnosticStep,
  };
};

describe("createBundleAssetLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads an asset once and lists it as loaded", async () => {
    const { loader, reads } = createLoader();

    await Promise.all([
      loader.loadAsset("picture-1"),
      loader.loadAsset("picture-1"),
    ]);
    await loader.loadAsset("picture-1");

    expect(reads).toEqual(["picture-1"]);
    expect(loader.isAssetLoaded("picture-1")).toBe(true);
    expect(loader.isAssetLoaded("picture-2")).toBe(false);
  });

  it("tells pictures from sounds and other files", async () => {
    const { loader } = createLoader();
    await loader.ensureAssetsLoaded(["picture-1", "sound-1", "font-1"]);

    expect(loader.getLoadedImageAssetIds()).toEqual(["picture-1"]);
    expect(loader.isAssetLoaded("sound-1")).toBe(true);
  });

  it("counts a loaded file as a picture when its bytes are one", async () => {
    const { loader } = createLoader();
    const renderState = { src: "generic-1" };
    // Before the load, only the type the package lists is known.
    expect(loader.collectImageAssetIds(renderState)).toEqual([]);

    await loader.loadAsset("generic-1");

    expect(loader.getLoadedImageAssetIds()).toEqual(["generic-1"]);
    expect(loader.collectImageAssetIds(renderState)).toEqual(["generic-1"]);
  });

  it("finds the missing assets and the pictures of a screen", async () => {
    const { loader } = createLoader();
    await loader.loadAsset("picture-1");
    const renderState = {
      elements: [
        { src: "picture-1", children: [{ src: "picture-2" }] },
        { text: "not-in-package" },
      ],
      audio: [{ src: "sound-1" }],
    };

    expect(loader.collectMissingAssetIds(renderState)).toEqual([
      "picture-2",
      "sound-1",
    ]);
    expect(loader.collectImageAssetIds(renderState)).toEqual([
      "picture-1",
      "picture-2",
    ]);
  });

  it("reports progress and skips ids that are not in the package", async () => {
    const { loader, reads } = createLoader();
    const onProgress = vi.fn();

    await loader.ensureAssetsLoaded(
      ["picture-1", "picture-1", "not-in-package", "sound-1"],
      onProgress,
    );

    expect(reads.sort()).toEqual(["picture-1", "sound-1"]);
    expect(onProgress).toHaveBeenNthCalledWith(1, { loaded: 0, total: 2 });
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 2, total: 2 });
  });

  it("marks an unloaded asset as missing at once", async () => {
    const { loader } = createLoader();
    await loader.ensureAssetsLoaded(["picture-1", "picture-2"]);

    loader.unloadAssets(["picture-1"]);

    expect(loader.isAssetLoaded("picture-1")).toBe(false);
    expect(loader.getLoadedImageAssetIds()).toEqual(["picture-2"]);
    expect(loader.collectMissingAssetIds({ src: "picture-1" })).toEqual([
      "picture-1",
    ]);
  });

  it("waits for the unload to end before it loads the asset again", async () => {
    const { loader, calls, unloads } = createLoader();
    await loader.loadAsset("picture-1");
    loader.unloadAssets(["picture-1"]);

    const reload = loader.loadAsset("picture-1");
    await flushPromises();
    expect(calls).toEqual(["load picture-1", "unload picture-1"]);

    await unloads[0].finish();
    await reload;
    expect(calls).toEqual([
      "load picture-1",
      "unload picture-1",
      "unloaded picture-1",
      "load picture-1",
    ]);
    expect(loader.isAssetLoaded("picture-1")).toBe(true);
  });

  it("does not hold up assets that are not being unloaded", async () => {
    const { loader, unloads } = createLoader();
    await loader.loadAsset("picture-1");
    loader.unloadAssets(["picture-1"]);

    await loader.loadAsset("picture-2");

    expect(loader.isAssetLoaded("picture-2")).toBe(true);
    await unloads[0].finish();
  });

  it("keeps a failed unload missing, reports it, and loads the asset again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { loader, calls, unloads, reads, recordDiagnosticStep } =
      createLoader();
    await loader.ensureAssetsLoaded(["picture-1", "picture-2"]);
    loader.unloadAssets(["picture-1", "picture-2"]);
    const reload = loader.ensureAssetsLoaded(["picture-1"]);

    await unloads[0].fail(new Error("texture is in use"));
    await reload;

    expect(warn).toHaveBeenCalled();
    expect(recordDiagnosticStep).toHaveBeenCalledWith(
      "Failed to unload runtime assets",
      { assetIds: ["picture-1", "picture-2"], error: "texture is in use" },
    );
    // The graphics engine no longer draws either picture, so both count as
    // missing until they are loaded again.
    expect(loader.isAssetLoaded("picture-1")).toBe(true);
    expect(loader.isAssetLoaded("picture-2")).toBe(false);
    expect(reads.filter((assetId) => assetId === "picture-1")).toHaveLength(2);
    expect(calls.at(-1)).toBe("load picture-1");
  });

  it("waits for the newest unload when an asset is unloaded twice", async () => {
    const { loader, calls, unloads } = createLoader();
    await loader.loadAsset("picture-1");
    loader.unloadAssets(["picture-1"]);
    await unloads[0].finish();
    await loader.loadAsset("picture-1");
    loader.unloadAssets(["picture-1"]);

    const reload = loader.loadAsset("picture-1");
    await flushPromises();
    expect(calls.at(-1)).toBe("unload picture-1");

    await unloads[1].finish();
    await reload;
    expect(calls.at(-1)).toBe("load picture-1");
  });

  it("leaves a failed load missing so it can be tried again", async () => {
    const { loader, routeGraphics } = createLoader();
    routeGraphics.loadAssets.mockRejectedValueOnce(new Error("decode failed"));

    await expect(loader.loadAsset("picture-1")).rejects.toThrow(
      'Graphics engine failed to load asset "picture-1".',
    );
    expect(loader.isAssetLoaded("picture-1")).toBe(false);

    await loader.loadAsset("picture-1");
    expect(loader.isAssetLoaded("picture-1")).toBe(true);
  });

  it("loads an asset again for a screen when a load under way fails", async () => {
    const { loader, bundleReader, reads } = createLoader();
    bundleReader.readAsset.mockRejectedValueOnce(new Error("read failed once"));
    // The background load, which the screen's load joins.
    const background = loader.loadAsset("picture-1").catch((error) => error);

    await loader.ensureAssetsLoaded(["picture-1"]);

    expect((await background).message).toBe(
      'Failed to read bundle asset "picture-1".',
    );
    expect(loader.isAssetLoaded("picture-1")).toBe(true);
    expect(reads).toEqual(["picture-1"]);
    expect(bundleReader.readAsset).toHaveBeenCalledTimes(2);
  });

  it("fails the screen when its own second load fails as well", async () => {
    const { loader, bundleReader } = createLoader();
    bundleReader.readAsset.mockRejectedValue(new Error("unreadable"));
    const background = loader.loadAsset("picture-1").catch((error) => error);

    await expect(loader.ensureAssetsLoaded(["picture-1"])).rejects.toThrow(
      'Failed to read bundle asset "picture-1".',
    );
    await background;
    expect(bundleReader.readAsset).toHaveBeenCalledTimes(2);
  });

  it("does not load an asset twice when the screen's own load fails", async () => {
    const { loader, bundleReader } = createLoader();
    bundleReader.readAsset.mockRejectedValue(new Error("unreadable"));

    await expect(loader.ensureAssetsLoaded(["picture-1"])).rejects.toThrow();

    expect(bundleReader.readAsset).toHaveBeenCalledTimes(1);
  });

  it("names the asset when the package cannot be read", async () => {
    const { loader, bundleReader } = createLoader();
    const cause = new Error("range read failed");
    bundleReader.readAsset.mockRejectedValueOnce(cause);

    const error = await loader.loadAsset("picture-1").catch((caught) => caught);

    expect(error.message).toBe('Failed to read bundle asset "picture-1".');
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual({ assetId: "picture-1" });
  });
});
