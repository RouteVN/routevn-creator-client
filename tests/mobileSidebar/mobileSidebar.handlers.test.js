import { describe, expect, it, vi } from "vitest";
import { handleBeforeMount } from "../../src/components/mobileSidebar/mobileSidebar.handlers.js";
import * as sidebarStore from "../../src/components/mobileSidebar/mobileSidebar.store.js";

const createDeps = (ensuredProjectId) => {
  const state = sidebarStore.createInitialState();
  return {
    appService: {
      getCurrentProjectId: () => "project-1",
      getUserConfig: (key) =>
        key === "sceneEditor.recentSceneIdsByProject"
          ? { "project-1": ["scene-1"] }
          : undefined,
    },
    projectService: {
      getEnsuredProjectId: () => ensuredProjectId,
      subscribeProjectState: vi.fn(() => {
        throw new Error("Repository not initialized");
      }),
    },
    store: {
      setAssetPackageEnabled: (payload) =>
        sidebarStore.setAssetPackageEnabled({ state }, payload),
      setRecentSceneIds: (payload) =>
        sidebarStore.setRecentSceneIds({ state }, payload),
      setScenesData: (payload) =>
        sidebarStore.setScenesData({ state }, payload),
      selectViewData: (variant) =>
        sidebarStore.selectViewData({ state, props: { variant } }),
    },
    render: vi.fn(),
  };
};

describe("mobile sidebar initialization", () => {
  it.each([undefined, "project-2"])(
    "keeps every navigation menu available without the selected repository (loaded: %s)",
    (ensuredProjectId) => {
      const deps = createDeps(ensuredProjectId);

      expect(() => handleBeforeMount(deps)).not.toThrow();

      expect(deps.projectService.subscribeProjectState).not.toHaveBeenCalled();
      for (const [variant, firstItem] of [
        ["assets", "images"],
        ["scene-map", "scene-map"],
        ["release", "versions"],
        ["settings", "project"],
      ]) {
        const { sections } = deps.store.selectViewData(variant);
        expect(sections[0].items[0].id).toBe(firstItem);
      }
      expect(deps.store.selectViewData("scene-map").sections).toHaveLength(1);
    },
  );

  it("updates recent scenes when the selected repository is loaded and cleans up on unmount", () => {
    const deps = createDeps("project-1");
    const unsubscribe = vi.fn();
    let onProjectState;
    deps.projectService.subscribeProjectState.mockImplementation((listener) => {
      onProjectState = listener;
      return unsubscribe;
    });

    const cleanup = handleBeforeMount(deps);
    onProjectState({
      repositoryState: {
        scenes: {
          tree: [{ id: "scene-1" }],
          items: {
            "scene-1": { id: "scene-1", type: "scene", name: "Opening" },
          },
        },
      },
    });
    expect(
      deps.store.selectViewData("scene-map").sections[1].items[0],
    ).toMatchObject({
      id: "scene:scene-1",
      label: "Opening",
    });
    expect(deps.render).toHaveBeenCalledOnce();

    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
