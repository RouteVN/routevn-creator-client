import { describe, expect, it } from "vitest";
import {
  closeMobileDeleteDialog,
  createInitialState,
  openMobileDeleteDialog,
  selectMobileDeleteDialogItemId,
  selectViewData,
  setItems,
} from "../../src/pages/sounds/sounds.store.js";

const createContext = () => ({
  state: createInitialState(),
});

describe("sounds store mobile delete dialog", () => {
  it("tracks the selected sound for delete confirmation", () => {
    const context = createContext();

    setItems(context, {
      data: {
        tree: [{ id: "sound-1" }],
        items: {
          "sound-1": {
            id: "sound-1",
            type: "sound",
            name: "Theme",
          },
        },
      },
    });

    openMobileDeleteDialog(context, {
      itemId: "sound-1",
    });

    const viewData = selectViewData(context);
    expect(viewData.mobileDeleteDialogOpen).toBe(true);
    expect(viewData.mobileDeleteDialogTitle).toBe("Delete Sound");
    expect(viewData.mobileDeleteDialogMessage).toBe(
      'Delete "Theme"? This cannot be undone.',
    );
    expect(viewData.mobileDeleteDialogConfirmLabel).toBe("Delete");
    expect(selectMobileDeleteDialogItemId(context)).toBe("sound-1");

    closeMobileDeleteDialog(context);

    expect(selectMobileDeleteDialogItemId(context)).toBeUndefined();
    expect(selectViewData(context).mobileDeleteDialogOpen).toBe(false);
  });
});
