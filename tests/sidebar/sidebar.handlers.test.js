import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleBeforeMount,
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
      historyMode: "replace",
      timing: undefined,
    });
  });

  it("selects sidebar groups from consecutive committed route props", () => {
    const state = createInitialState();

    expect(
      selectViewData({
        state,
        props: { currentRoute: "/project/images" },
      }).selectedItemId,
    ).toBe("assets");
    expect(
      selectViewData({
        state,
        props: { currentRoute: "/project/scenes" },
      }).selectedItemId,
    ).toBe("scenes");
    expect(
      selectViewData({
        state,
        props: { currentRoute: "/project/about" },
      }).selectedItemId,
    ).toBe("settings");
  });

  it("does not render from a redirect request before the route is committed", () => {
    const deps = createDeps();
    deps.subject = new Subject();
    deps.handlers = {
      handleProjectImageUpdate: vi.fn(),
    };

    const cleanup = handleBeforeMount(deps);
    deps.subject.next({ action: "redirect" });

    expect(deps.render).not.toHaveBeenCalled();
    cleanup();
  });
});
