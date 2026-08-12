import { describe, expect, it, vi } from "vitest";
import { createResourceFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

const createDeps = ({ createResult = "folder-1" } = {}) => {
  const createAudioEffect = vi.fn(async () => createResult);
  return {
    deps: {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          audioEffects: {
            items: {},
            tree: [],
          },
        }),
        createAudioEffect,
      },
    },
    createAudioEffect,
  };
};

describe("audio effects file explorer", () => {
  it("creates a root folder from the empty explorer menu", async () => {
    const refresh = vi.fn(async () => {});
    const { createAudioEffect, deps } = createDeps();
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "audioEffects",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          item: {
            value: "new-item",
          },
        },
      },
    });

    expect(createAudioEffect).toHaveBeenCalledWith({
      audioEffectId: expect.any(String),
      data: {
        type: "folder",
        name: "New Folder",
      },
      parentId: null,
      position: "last",
    });
    expect(refresh).toHaveBeenCalledWith(deps, {
      selectedItemId: "folder-1",
    });
  });

  it("shows feedback when the model rejects folder creation", async () => {
    const refresh = vi.fn(async () => {});
    const { deps } = createDeps({
      createResult: {
        valid: false,
        error: { message: "Unsupported command type" },
      },
    });
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "audioEffects",
      refresh,
      copy: {
        failedCreateFolder: "Failed to create audio effect folder.",
      },
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          item: {
            value: "new-item",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to create audio effect folder.",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
