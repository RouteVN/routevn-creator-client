import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  toggleGroupCollapse,
} from "../../src/components/catalogResourcesView/catalogResourcesView.store.js";

describe("catalogResourcesView.store", () => {
  it("keeps the selected item visible inside a collapsed group", () => {
    const state = createInitialState();
    toggleGroupCollapse(
      { state },
      {
        groupId: "folder-1",
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        selectedItemId: "animation-1",
        groups: [
          {
            id: "folder-1",
            name: "Folder",
            fullLabel: "Folder",
            children: [
              {
                id: "animation-1",
                name: "Imported Animation",
              },
            ],
          },
        ],
      },
    });

    expect(viewData.groups[0].isCollapsed).toBe(false);
    expect(viewData.groups[0].children).toEqual([
      expect.objectContaining({
        id: "animation-1",
        name: "Imported Animation",
      }),
    ]);
  });
});
