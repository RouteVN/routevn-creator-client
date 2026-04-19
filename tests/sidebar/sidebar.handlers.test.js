import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleProjectImageUpdate,
} from "../../src/pages/sidebar/sidebar.handlers.js";

const createDeps = () => ({
  appService: {
    refreshCurrentProjectEntry: vi.fn(),
    getCurrentProjectEntry: vi.fn(),
  },
  store: {
    setProjectImageUrl: vi.fn(),
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
});
