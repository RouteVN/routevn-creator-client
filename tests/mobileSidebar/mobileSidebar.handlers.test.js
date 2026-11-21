import { describe, expect, it, vi } from "vitest";
import { handleBeforeMount } from "../../src/components/mobileSidebar/mobileSidebar.handlers.js";
import * as sidebarStore from "../../src/components/mobileSidebar/mobileSidebar.store.js";

const createDeps = (
  ensuredProjectId,
  { path = "/project/images", payload = { p: "project-1" } } = {},
) => {
  const state = sidebarStore.createInitialState();
  return {
    appService: {
      getCurrentProjectId: () => "project-1",
      getPath: () => path,
      getPayload: () => payload,
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
      setCurrentLocation: (location) =>
        sidebarStore.setCurrentLocation({ state }, location),
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

  it("highlights the item for the route it opened on", () => {
    const deps = createDeps(undefined, { path: "/project/sounds" });

    handleBeforeMount(deps);

    const items = deps.store
      .selectViewData("assets")
      .sections.flatMap((section) => section.items);
    expect(items.find((item) => item.id === "sounds").bgc).toBe("ac");
    expect(items.find((item) => item.id === "images").bgc).toBe("bg");
  });

  it("highlights the open scene in the scene editor", () => {
    const deps = createDeps("project-1", {
      path: "/project/scene-editor",
      payload: { p: "project-1", s: "scene-1" },
    });
    let onProjectState;
    deps.projectService.subscribeProjectState.mockImplementation((listener) => {
      onProjectState = listener;
      return vi.fn();
    });

    handleBeforeMount(deps);
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
    ).toMatchObject({ id: "scene:scene-1", bgc: "ac" });
  });
});
