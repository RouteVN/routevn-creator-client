import { describe, expect, it, vi } from "vitest";
import { handleEmptyAddClick } from "../../src/components/baseFileExplorer/baseFileExplorer.handlers.js";
import { handleAddVisualClick } from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import { handleMenuButtonClick as handleImportMenuButtonClick } from "../../src/components/resourceImportAction/resourceImportAction.handlers.js";
import { handleMenuButtonClick as handlePlayerMenuButtonClick } from "../../src/components/youtubePlayer/youtubePlayer.handlers.js";
import { openTagFilterPopoverFromButton } from "../../src/internal/ui/tagFilterPopover.handlers.js";
import { handleAddPlatformButtonClick } from "../../src/pages/platformDetails/platformDetails.handlers.js";

// A 44px button near the left edge, where it sits in a right-to-left header.
const BUTTON_RECT = { left: 20, right: 64, top: 10, bottom: 54 };

const createDeps = (direction, store) => ({
  appService: { getDocumentDirection: () => direction },
  render: vi.fn(),
  store,
});

const clickEvent = () => ({
  _event: {
    stopPropagation: vi.fn(),
    currentTarget: { getBoundingClientRect: () => BUTTON_RECT },
  },
});

describe("popovers anchored on a button", () => {
  describe.each([
    ["ltr", { start: 20, end: 64 }],
    ["rtl", { start: 64, end: 20 }],
  ])("in %s", (direction, anchorX) => {
    it("align three-dot menus with the button's inline end", () => {
      const playerStore = { openMenu: vi.fn() };
      handlePlayerMenuButtonClick(
        createDeps(direction, playerStore),
        clickEvent(),
      );
      expect(playerStore.openMenu).toHaveBeenCalledWith({
        x: anchorX.end,
        y: 54,
      });

      const importStore = { openMenu: vi.fn() };
      handleImportMenuButtonClick(
        createDeps(direction, importStore),
        clickEvent(),
      );
      expect(importStore.openMenu).toHaveBeenCalledWith({
        x: anchorX.end,
        y: 54,
      });
    });

    it("align add menus with the button's inline start", () => {
      const visualStore = {
        hideDropdownMenu: vi.fn(),
        openAddVisualPopover: vi.fn(),
      };
      handleAddVisualClick(createDeps(direction, visualStore), clickEvent());
      expect(visualStore.openAddVisualPopover).toHaveBeenCalledWith({
        position: { x: anchorX.start, y: 54 },
      });

      const platformStore = { openAddPlatformMenu: vi.fn() };
      handleAddPlatformButtonClick(
        createDeps(direction, platformStore),
        clickEvent(),
      );
      expect(platformStore.openAddPlatformMenu).toHaveBeenCalledWith({
        x: anchorX.start,
        y: 54,
      });

      // The add box of an empty explorer list.
      const emptyContextMenuItems = [{ label: "New Folder", value: "new" }];
      const explorerStore = {
        selectSuppressNextClick: () => false,
        showDropdownMenuFileExplorerEmpty: vi.fn(),
      };
      const event = clickEvent();
      event._event.preventDefault = vi.fn();
      handleEmptyAddClick(
        {
          ...createDeps(direction, explorerStore),
          props: { emptyContextMenuItems },
        },
        event,
      );
      expect(
        explorerStore.showDropdownMenuFileExplorerEmpty,
      ).toHaveBeenCalledWith({
        position: { x: anchorX.start, y: 58 },
        emptyContextMenuItems,
      });
    });

    it.each([
      [true, "end"],
      [false, "start"],
    ])(
      "align the tag filter with alignEnd %s at the inline %s",
      (alignEnd, edge) => {
        const store = { openTagFilterPopover: vi.fn() };
        openTagFilterPopoverFromButton(
          {
            ...createDeps(direction, store),
            props: {},
            refs: {
              tagFilterButton: { getBoundingClientRect: () => BUTTON_RECT },
            },
          },
          clickEvent(),
          { alignEnd },
        );
        expect(store.openTagFilterPopover).toHaveBeenCalledWith({
          position: { x: anchorX[edge], y: 54 },
          tagIds: [],
        });
      },
    );
  });
});
