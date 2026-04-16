import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectIsDraggingMinimapViewport,
  selectMinimapData,
  setContainerSize,
  setInitialZoomAndPan,
  startMinimapViewportDragging,
  stopMinimapViewportDragging,
  updatePanFromMinimapViewportDragging,
} from "../../src/components/whiteboard/whiteboard.store.js";

const createItems = () => [
  {
    id: "scene-1",
    name: "Scene 1",
    x: 0,
    y: 0,
  },
  {
    id: "scene-2",
    name: "Scene 2",
    x: 1200,
    y: 700,
  },
];

describe("whiteboard minimap viewport drag", () => {
  it("updates pan from minimap viewport drag movement", () => {
    const state = createInitialState();
    const items = createItems();

    setContainerSize({ state }, { width: 480, height: 320 });
    setInitialZoomAndPan(
      { state },
      { zoomLevel: 1.25, panX: -180, panY: -120 },
    );

    const minimapData = selectMinimapData({ state }, { items });
    const startMouseX = minimapData.viewport.x + 10;
    const startMouseY = minimapData.viewport.y + 8;

    startMinimapViewportDragging(
      { state },
      {
        mouseX: startMouseX,
        mouseY: startMouseY,
        minimapData,
      },
    );

    updatePanFromMinimapViewportDragging(
      { state },
      {
        mouseX: startMouseX + 24,
        mouseY: startMouseY + 18,
      },
    );

    expect(state.panX).toBeCloseTo(-180 - (24 / minimapData.scale) * 1.25, 6);
    expect(state.panY).toBeCloseTo(-120 - (18 / minimapData.scale) * 1.25, 6);
  });

  it("allows the viewport to move outside minimap bounds while dragging", () => {
    const state = createInitialState();
    const items = createItems();

    setContainerSize({ state }, { width: 480, height: 320 });
    setInitialZoomAndPan({ state }, { zoomLevel: 1, panX: -220, panY: -140 });

    const minimapData = selectMinimapData({ state }, { items });
    startMinimapViewportDragging(
      { state },
      {
        mouseX: minimapData.viewport.x + 12,
        mouseY: minimapData.viewport.y + 12,
        minimapData,
      },
    );

    updatePanFromMinimapViewportDragging(
      { state },
      {
        mouseX: minimapData.minimap.width + 500,
        mouseY: minimapData.minimap.height + 500,
      },
    );

    const expectedViewportX = minimapData.minimap.width + 500 - 12;
    const expectedViewportY = minimapData.minimap.height + 500 - 12;
    const expectedPanX =
      -220 - (expectedViewportX - minimapData.viewport.x) / minimapData.scale;
    const expectedPanY =
      -140 - (expectedViewportY - minimapData.viewport.y) / minimapData.scale;

    expect(state.panX).toBeCloseTo(expectedPanX, 6);
    expect(state.panY).toBeCloseTo(expectedPanY, 6);

    const draggedMinimapData = selectMinimapData({ state }, { items });
    expect(draggedMinimapData.viewport.x).toBe(
      draggedMinimapData.minimap.width - 1,
    );
    expect(draggedMinimapData.viewport.y).toBe(
      draggedMinimapData.minimap.height - 1,
    );
    expect(draggedMinimapData.viewport.width).toBe(1);
    expect(draggedMinimapData.viewport.height).toBe(1);

    expect(selectIsDraggingMinimapViewport({ state })).toBe(true);

    stopMinimapViewportDragging({ state });

    expect(selectIsDraggingMinimapViewport({ state })).toBe(false);
  });
});
