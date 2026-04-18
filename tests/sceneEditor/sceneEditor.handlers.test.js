import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLineNavigation } from "../../src/pages/sceneEditor/sceneEditor.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createStore = ({ selectedLineId = "line-2" } = {}) => {
  let currentSelectedLineId = selectedLineId;
  const scene = {
    sections: [
      {
        id: "section-1",
        lines: [{ id: "line-1" }, { id: "line-2" }, { id: "line-3" }],
      },
    ],
  };

  return {
    selectIsSectionsOverviewOpen: vi.fn(() => false),
    selectSelectedLineId: vi.fn(() => currentSelectedLineId),
    setSelectedLineId: vi.fn(({ selectedLineId: nextLineId }) => {
      currentSelectedLineId = nextLineId;
    }),
    selectPreviousLineId: vi.fn(({ lineId }) => {
      if (lineId === "line-3") {
        return "line-2";
      }
      if (lineId === "line-2") {
        return "line-1";
      }
      return "line-1";
    }),
    selectNextLineId: vi.fn(({ lineId }) => {
      if (lineId === "line-1") {
        return "line-2";
      }
      if (lineId === "line-2") {
        return "line-3";
      }
      return "line-3";
    }),
    selectScene: vi.fn(() => scene),
    selectSelectedSectionId: vi.fn(() => "section-1"),
  };
};

describe("sceneEditor.handlers line navigation", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("uses the current selected line when a stale text-editor navigation target arrives", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const store = createStore({
      selectedLineId: "line-2",
    });
    const deps = {
      store,
      refs: {},
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    handleLineNavigation(deps, {
      _event: {
        detail: {
          targetLineId: "line-1",
          mode: "text-editor",
          direction: "down",
          targetCursorPosition: 5,
        },
      },
    });

    expect(store.selectNextLineId).toHaveBeenCalledWith({
      lineId: "line-2",
    });
    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: "line-3",
    });
  });
});
