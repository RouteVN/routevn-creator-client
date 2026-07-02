import { describe, expect, it } from "vitest";
import {
  closeMobileDeleteDialog,
  createInitialState,
  openMobileDeleteDialog,
  selectMobileDeleteDialogItemId,
  selectViewData,
  setItems,
  setUiConfig,
  updateAudioPlayerLeft,
  updateAudioPlayerRight,
} from "../../src/pages/sounds/sounds.store.js";

const createContext = () => ({
  state: createInitialState(),
  i18n: {
    resourcePages: {},
    soundsPage: {
      title: "Sounds",
      deleteButton: "Delete",
      deleteMessage: "Delete {itemName}? This cannot be undone.",
      deleteTargetFallback: "this sound",
      deleteTitle: "Delete Sound",
    },
  },
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

describe("sounds store audio player layout", () => {
  it("uses desktop panel offsets outside touch mode and full width in touch mode", () => {
    const context = createContext();

    updateAudioPlayerLeft(context, { width: 300 });
    updateAudioPlayerRight(context, { width: 270 });

    expect(selectViewData(context).audioPlayerLeft).toBe(364);
    expect(selectViewData(context).audioPlayerRight).toBe(270);

    setUiConfig(context, {
      uiConfig: {
        id: "touch",
      },
    });

    expect(selectViewData(context).audioPlayerLeft).toBe(0);
    expect(selectViewData(context).audioPlayerRight).toBe(0);
  });
});
