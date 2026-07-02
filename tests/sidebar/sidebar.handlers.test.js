import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleItemClick,
  handleProjectImageUpdate,
} from "../../src/pages/sidebar/sidebar.handlers.js";
import {
  createInitialState,
  selectViewData,
} from "../../src/pages/sidebar/sidebar.store.js";

const createDeps = () => ({
  appService: {
    refreshCurrentProjectEntry: vi.fn(),
    getCurrentProjectEntry: vi.fn(),
    getPayload: vi.fn(() => ({ p: "project-1" })),
  },
  store: {
    setProjectImageUrl: vi.fn(),
  },
  subject: {
    dispatch: vi.fn(),
  },
  render: vi.fn(),
});

describe("sidebar.handlers", () => {
  it("refreshes the current project entry before syncing the sidebar icon on mount", async () => {
    const deps = createDeps();
    deps.appService.refreshCurrentProjectEntry.mockResolvedValue({
      iconUrl: "blob:project-icon",
    });

    await handleAfterMount(deps);

    expect(deps.appService.refreshCurrentProjectEntry).toHaveBeenCalledTimes(1);
    expect(deps.store.setProjectImageUrl).toHaveBeenCalledWith({
      imageUrl: "blob:project-icon",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.appService.getCurrentProjectEntry).not.toHaveBeenCalled();
  });

  it("refreshes and syncs the sidebar icon after project image updates", async () => {
    const deps = createDeps();
    deps.appService.refreshCurrentProjectEntry.mockResolvedValue({
      iconUrl: "blob:updated-project-icon",
    });

    await handleProjectImageUpdate(deps);

    expect(deps.appService.refreshCurrentProjectEntry).toHaveBeenCalledTimes(1);
    expect(deps.store.setProjectImageUrl).toHaveBeenCalledWith({
      imageUrl: "blob:updated-project-icon",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("uses sidebar item paths when dispatching navigation", async () => {
    const deps = createDeps();

    await handleItemClick(deps, {
      _event: {
        detail: {
          item: {
            id: "assets",
            path: "/project/images",
          },
        },
      },
    });

    expect(deps.subject.dispatch).toHaveBeenCalledWith("redirect", {
      path: "/project/images",
      payload: { p: "project-1" },
      timing: undefined,
    });
  });

  it("selects sidebar groups by item id for nested resource routes", () => {
    const originalWindow = globalThis.window;

    globalThis.window = {
      location: {
        pathname: "/project/images",
      },
    };

    try {
      const viewData = selectViewData({ state: createInitialState() });

      expect(viewData.selectedItemId).toBe("assets");
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
