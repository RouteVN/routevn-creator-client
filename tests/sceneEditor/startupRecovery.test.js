import { expect, it, vi } from "vitest";
import { handleAfterMount } from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import { initializeSceneEditorPage } from "../../src/internal/ui/sceneEditor/runtime.js";
import { EN_I18N } from "../support/i18n.js";

vi.mock(
  "../../src/internal/ui/sceneEditor/runtime.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    initializeSceneEditorPage: vi.fn(),
  }),
);

it("leaves failed scene startup and reports the error without keeping the loading overlay", async () => {
  const error = new Error("Computed variable has a non-finite result");
  vi.mocked(initializeSceneEditorPage).mockRejectedValueOnce(error);
  let isLoading = true;
  const payload = { p: "project-one", s: "scene-one" };
  const deps = {
    projectService: {},
    store: {
      selectMountVersion: () => 1,
      setScenePageLoading: vi.fn(({ isLoading: value }) => {
        isLoading = value;
      }),
      selectIsScenePageLoading: () => isLoading,
      selectIsSceneAssetLoading: () => false,
    },
    appService: {
      showToast: vi.fn(),
      getPayload: () => payload,
      navigate: vi.fn(),
    },
    i18n: EN_I18N,
    render: vi.fn(),
  };
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(handleAfterMount(deps)).resolves.toBeUndefined();
    expect(isLoading).toBe(false);
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not open the scene.",
      status: "error",
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith("/project", payload);
  } finally {
    log.mockRestore();
  }
});

it("ignores a startup error from an editor that has been unmounted", async () => {
  let rejectStartup;
  vi.mocked(initializeSceneEditorPage).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectStartup = reject;
      }),
  );
  let mountVersion = 1;
  const deps = {
    store: {
      selectMountVersion: () => mountVersion,
      setScenePageLoading: vi.fn(),
      selectIsScenePageLoading: () => false,
      selectIsSceneAssetLoading: () => false,
    },
    appService: {
      showToast: vi.fn(),
      navigate: vi.fn(),
      getPayload: () => ({ p: "project-one" }),
    },
    i18n: EN_I18N,
  };
  const pending = handleAfterMount(deps);
  mountVersion += 1;
  rejectStartup(new Error("Abandoned startup failed"));
  await expect(pending).resolves.toBeUndefined();
  expect(deps.appService.showToast).not.toHaveBeenCalled();
  expect(deps.appService.navigate).not.toHaveBeenCalled();
});
