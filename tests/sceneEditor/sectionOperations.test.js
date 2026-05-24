import { describe, expect, it, vi } from "vitest";
import { createSceneEditorSectionWithName } from "../../src/internal/ui/sceneEditor/sectionOperations.js";

describe("scene editor section operations", () => {
  it("does not select or scroll to a newly created section", async () => {
    vi.useFakeTimers();

    try {
      const store = {
        selectSceneId: vi.fn(() => "scene-1"),
        setSelectedSectionId: vi.fn(),
        setSelectedLineId: vi.fn(),
      };
      const projectService = {
        getState: vi.fn(() => ({
          layouts: { items: {} },
          controls: { items: {} },
        })),
        createSectionItem: vi.fn(async () => {}),
        createLineItem: vi.fn(async () => {}),
      };
      const render = vi.fn();
      const syncProjectState = vi.fn();

      await createSceneEditorSectionWithName(
        { store, projectService, render },
        "New Section",
        syncProjectState,
        {
          inheritPresentationFromSelectedLine: false,
          position: "after",
          positionTargetId: "section-1",
        },
      );

      expect(projectService.createSectionItem).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneId: "scene-1",
          position: "after",
          positionTargetId: "section-1",
          data: {
            name: "New Section",
          },
        }),
      );
      expect(projectService.createLineItem).toHaveBeenCalledOnce();
      expect(syncProjectState).toHaveBeenCalledWith(store, projectService);
      expect(store.setSelectedSectionId).not.toHaveBeenCalled();
      expect(store.setSelectedLineId).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
