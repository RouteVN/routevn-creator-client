import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectItemById,
  selectViewData,
  setRecentSceneIds,
  setScenesData,
} from "../../src/components/mobileSidebar/mobileSidebar.store.js";

const createScenesData = () => ({
  tree: [{ id: "scene-1" }, { id: "scene-2" }, { id: "folder-1" }],
  items: {
    "scene-1": {
      id: "scene-1",
      type: "scene",
      name: "Opening",
    },
    "scene-2": {
      id: "scene-2",
      type: "scene",
      name: "Branch",
    },
    "folder-1": {
      id: "folder-1",
      type: "folder",
      name: "Archive",
    },
  },
});

describe("mobileSidebar scene map sections", () => {
  it("shows scene map and recently visited scenes instead of a full linear scene list", () => {
    const state = createInitialState();
    setScenesData({ state }, { scenesData: createScenesData() });
    setRecentSceneIds(
      { state },
      {
        sceneIds: ["scene-2", "missing-scene", "scene-1"],
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        variant: "scene-map",
      },
    });

    expect(viewData.sections).toHaveLength(2);
    expect(viewData.sections[0]).toMatchObject({
      id: "scene-map",
      label: "Scene Map",
    });
    expect(viewData.sections[0].items).toEqual([
      expect.objectContaining({
        id: "scene-map",
        label: "Scene Map",
        path: "/project/scenes",
      }),
    ]);
    expect(viewData.sections[1]).toMatchObject({
      id: "recently-visited",
      label: "Recently Visited",
    });
    expect(viewData.sections[1].items.map((item) => item.label)).toEqual([
      "Branch",
      "Opening",
    ]);
    expect(selectItemById({ state }, { itemId: "scene:scene-2" })).toEqual(
      expect.objectContaining({
        path: "/project/scene-editor",
        payload: {
          s: "scene-2",
        },
      }),
    );
  });
});
