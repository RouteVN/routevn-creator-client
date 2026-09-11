import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import { handleItemLongPress as handleMediaLongPress } from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import { handleItemLongPress as handleCatalogLongPress } from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";
import { handleVideoItemDoubleClick } from "../../src/pages/videos/videos.handlers.js";
import { handleFontItemDoubleClick } from "../../src/pages/fonts/fonts.handlers.js";
import { handleTransformItemDoubleClick } from "../../src/pages/transforms/transforms.handlers.js";
import { handleParticleItemDoubleClick } from "../../src/pages/particles/particles.handlers.js";
import { handleSpritesheetItemDoubleClick } from "../../src/pages/spritesheets/spritesheets.handlers.js";
import { handleSpriteItemDoubleClick } from "../../src/pages/characterSprites/characterSprites.handlers.js";
import { handleColorItemDoubleClick } from "../../src/pages/colors/colors.handlers.js";
import {
  buildMobileResourcePageViewData,
  createMobileResourcePageState,
  setMobileResourceDetailSheetSuppressedState,
} from "../../src/internal/ui/resourcePages/mobileResourcePage.js";

describe.each([
  [
    "colors",
    handleCatalogLongPress,
    handleColorItemDoubleClick,
    "selectColorItemById",
    "openPreviewDialog",
  ],
  [
    "videos",
    handleMediaLongPress,
    handleVideoItemDoubleClick,
    "selectVideoItemById",
    "setVideoVisible",
  ],
  [
    "fonts",
    handleMediaLongPress,
    handleFontItemDoubleClick,
    "selectFontItemById",
    "setModalOpen",
  ],
  [
    "transforms",
    handleCatalogLongPress,
    handleTransformItemDoubleClick,
    "selectTransformItemById",
    "openTransformPreviewDialog",
  ],
  [
    "particles",
    handleCatalogLongPress,
    handleParticleItemDoubleClick,
    "selectParticleItemById",
    "openParticlePreviewDialog",
  ],
  [
    "spritesheets",
    handleMediaLongPress,
    handleSpritesheetItemDoubleClick,
    "selectItemById",
    "openPreviewDialog",
  ],
  [
    "character spritesheets",
    handleMediaLongPress,
    handleSpriteItemDoubleClick,
    "selectSpriteItemById",
    "openSpritesheetPreviewDialog",
  ],
])(
  "%s long press",
  (name, handleLongPress, handlePrimaryAction, itemSelector, openAction) => {
    it("opens the preview and synchronizes selection without ever showing the action sheet", async () => {
      const item = {
        id: "item-1",
        name: "Resource One",
        type: {
          colors: "color",
          videos: "video",
          fonts: "font",
          transforms: "transform",
          particles: "particle",
          spritesheets: "spritesheet",
          "character spritesheets": "spritesheet",
        }[name],
        fileId: "file-1",
      };
      const state = createMobileResourcePageState();
      state.isTouchMode = true;
      const sheetVisible = () =>
        buildMobileResourcePageViewData({ state }).showMobileDetailSheet;
      const store = {
        setSelectedItemId: (payload) => {
          state.selectedItemId = payload.itemId;
          setMobileResourceDetailSheetSuppressedState(state, payload);
          expect(sheetVisible()).toBe(false);
        },
        selectCachedFontInfo: () => ({}),
        setPreviewFontItemId: vi.fn(),
        selectProjectResolution: () => ({ width: 1920, height: 1080 }),
        clearPreviewRuntime: vi.fn(),
      };
      store[itemSelector] = () => item;
      store[openAction] = vi.fn();
      const selectItem = vi.fn();
      const pageDeps = {
        i18n: EN_I18N,
        store,
        refs: { fileExplorer: { selectItem } },
        projectService: {
          getFileContent: async () => ({ url: "https://example.com/asset" }),
        },
        render: () => expect(sheetVisible()).toBe(false),
      };
      const actions = [];
      const dispatchEvent = vi.fn((event) => {
        expect(event.type).toBe("item-dblclick");
        actions.push(handlePrimaryAction(pageDeps, { _event: event }));
      });
      handleLongPress(
        { props: { mobileLayout: true }, dispatchEvent },
        {
          _event: {
            preventDefault: vi.fn(),
            currentTarget: { getAttribute: () => item.id },
          },
        },
      );
      await Promise.all(actions);
      expect(dispatchEvent).toHaveBeenCalledOnce();
      expect(store[openAction]).toHaveBeenCalledOnce();
      expect(selectItem).toHaveBeenCalledWith({ itemId: item.id });
      expect(state.selectedItemId).toBe(item.id);
      expect(sheetVisible()).toBe(false);
    });
  },
);
