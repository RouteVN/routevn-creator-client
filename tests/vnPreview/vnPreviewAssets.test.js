import { expect, it, vi } from "vitest";
import { loadPreviewStartupAssets } from "../../src/components/vnPreview/support/vnPreviewAssets.js";
import { getAssetLoadFailures } from "../../src/internal/ui/assetLoadFeedback.js";

it("collects file and decoder failures across the startup batch without blaming healthy assets", async () => {
  const revoke = vi.fn();
  const projectService = {
    getFileContent: vi.fn(async (id) => {
      if (id === "font" || id === "missing") throw new Error("unavailable");
      return { url: id, type: "image/png", revoke };
    }),
  };
  const graphicsService = {
    loadAssets: vi.fn(async (assets) => {
      if (assets.damaged) throw new Error("decode failure");
    }),
  };
  const error = await loadPreviewStartupAssets(
    { projectService, graphicsService },
    ["font", "missing", "damaged", "healthy", "font"].map((url) => ({ url })),
  ).catch((error) => error);
  expect(getAssetLoadFailures(error).map(({ fileId }) => fileId)).toEqual([
    "font",
    "missing",
    "damaged",
  ]);
  expect(projectService.getFileContent).toHaveBeenCalledTimes(4);
  expect(revoke).toHaveBeenCalledTimes(2);
});

it("loads healthy startup assets together and retains their URLs", async () => {
  const revoke = vi.fn();
  const deps = {
    projectService: {
      getFileContent: vi.fn(async (id) => ({ url: id, revoke })),
    },
    graphicsService: { loadAssets: vi.fn(async () => {}) },
  };
  await expect(
    loadPreviewStartupAssets(deps, [{ url: "one" }, { url: "two" }]),
  ).resolves.toEqual(["one", "two"]);
  expect(deps.graphicsService.loadAssets).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
});
