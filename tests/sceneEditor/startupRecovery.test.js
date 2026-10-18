import { expect, it, vi } from "vitest";
import { resolveComputedVariables } from "route-engine-js";
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

const OPEN_SCENE_FAILED_MESSAGE =
  "Could not open the scene.\n\nDetails:\nStartup failed";

it.each([
  {
    reason: "a non-finite computed number",
    computed: { expr: { mul: [1e308, { var: "variables.factor" }] } },
    message:
      "Could not calculate computed variable “Product”. Its formula may have produced the wrong type of value. Check the formula and the variables it uses in Variables.",
  },
  {
    reason: "a computed result with the wrong type",
    computed: { value: "text" },
    message:
      "Could not calculate computed variable “Product”. Its formula may have produced the wrong type of value. Check the formula and the variables it uses in Variables.",
  },
  {
    reason: "an unknown variable reference",
    computed: { expr: { div: [1, { var: "variables.missing" }] } },
    message:
      "Could not calculate computed variable “Product”. Its formula may have produced the wrong type of value. Check the formula and the variables it uses in Variables.",
  },
  {
    reason: "a computed variable that is no longer in the repository",
    computed: { expr: { mul: [1e308, { var: "variables.factor" }] } },
    repositoryId: "another-variable",
    message:
      'Could not open the scene.\n\nDetails:\nComputed variable "product" expected type number, got number',
  },
  {
    reason: "an unrelated startup error",
    message: OPEN_SCENE_FAILED_MESSAGE,
  },
  {
    reason: "a failure before the project loaded",
    repositoryUnavailable: true,
    message: OPEN_SCENE_FAILED_MESSAGE,
  },
])(
  "recovers from $reason and shows the relevant error",
  async ({
    computed,
    message,
    repositoryId = "product",
    repositoryUnavailable = false,
  }) => {
    vi.mocked(initializeSceneEditorPage).mockImplementationOnce(() => {
      if (computed) {
        resolveComputedVariables({
          variableConfigs: {
            factor: { type: "number", scope: "context", default: 10 },
            product: { type: "number", scope: "context", computed },
          },
          variables: { factor: 10 },
        });
      }
      throw new Error("Startup failed");
    });
    let isLoading = true;
    const payload = { p: "project-one", s: "scene-one" };
    const deps = {
      projectService: {
        getRepositoryState: () => {
          if (repositoryUnavailable) {
            throw new Error(
              "Repository not initialized. Call ensureRepository() first.",
            );
          }
          return {
            variables: {
              items: {
                [repositoryId]: {
                  type: "variable",
                  name: "Product",
                  variableType: "number",
                  computed,
                },
              },
            },
          };
        },
      },
      store: {
        selectMountVersion: () => 1,
        setScenePageLoading: vi.fn(({ isLoading: value }) => {
          isLoading = value;
        }),
        selectIsScenePageLoading: () => isLoading,
        selectIsSceneAssetLoading: () => false,
      },
      appService: {
        showAlert: vi.fn(),
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
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message,
        title: "Error",
      });
      // Leave the way the editor's Back button does.
      expect(deps.appService.navigate).toHaveBeenCalledWith(
        "/project/scenes",
        payload,
        { historyMode: "replace" },
      );
    } finally {
      log.mockRestore();
    }
  },
);

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
      showAlert: vi.fn(),
      navigate: vi.fn(),
      getPayload: () => ({ p: "project-one" }),
    },
    i18n: EN_I18N,
  };
  const pending = handleAfterMount(deps);
  mountVersion += 1;
  rejectStartup(new Error("Abandoned startup failed"));
  await expect(pending).resolves.toBeUndefined();
  expect(deps.appService.showAlert).not.toHaveBeenCalled();
  expect(deps.appService.navigate).not.toHaveBeenCalled();
});
