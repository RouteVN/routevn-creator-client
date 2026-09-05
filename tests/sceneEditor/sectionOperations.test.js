import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSceneEditorSectionWithName,
  scrollSceneEditorSectionTabIntoView,
} from "../../src/internal/ui/sceneEditor/sectionOperations.js";

describe("scene editor section operations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([0, 1996, 3400])(
    "jumps to the section beginning from scroll position %i, ignoring its sticky header",
    (scrollTop) => {
      vi.stubGlobal("requestAnimationFrame", (callback) => callback());
      const section = {
        dataset: { sectionBlockId: "section-2" },
        getBoundingClientRect: () => ({ top: 200 + 1296 - scrollTop }),
      };
      const stickyHeader = {
        dataset: { sectionId: "section-2" },
        getBoundingClientRect: () => ({ top: 200 }),
        scrollIntoView: vi.fn(),
      };
      const scrollContainer = {
        scrollTop,
        clientTop: 0,
        getBoundingClientRect: () => ({ top: 200 }),
        querySelectorAll: vi.fn(() => [section]),
        scrollTo: vi.fn(),
      };

      scrollSceneEditorSectionTabIntoView(
        {
          refs: {
            sceneEditorSectionsScroll: scrollContainer,
            sectionHeader1: stickyHeader,
          },
        },
        "section-2",
      );

      expect(scrollContainer.scrollTo).toHaveBeenCalledExactlyOnceWith({
        top: 1296,
        behavior: "instant",
      });
      expect(stickyHeader.scrollIntoView).not.toHaveBeenCalled();
    },
  );

  it("does not jump to another matching ref when the section has been removed", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const overviewRow = {
      dataset: { sectionId: "section-2" },
      scrollIntoView: vi.fn(),
    };
    const scrollContainer = {
      querySelectorAll: () => [],
      scrollTo: vi.fn(),
    };

    scrollSceneEditorSectionTabIntoView(
      {
        refs: {
          sceneEditorSectionsScroll: scrollContainer,
          sectionOverviewRow1: overviewRow,
        },
      },
      "section-2",
    );

    expect(scrollContainer.scrollTo).not.toHaveBeenCalled();
    expect(overviewRow.scrollIntoView).not.toHaveBeenCalled();
  });

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
