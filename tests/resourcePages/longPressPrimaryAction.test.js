import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import { handleItemLongPress as handleMediaLongPress } from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import { handleItemLongPress as handleCatalogLongPress } from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";
import { handleVideoItemDoubleClick } from "../../src/pages/videos/videos.handlers.js";
import { handleFontItemDoubleClick } from "../../src/pages/fonts/fonts.handlers.js";
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

describe.each([
  [
    "spritesheets",
    handleSpritesheetItemDoubleClick,
    "selectItemById",
    { p: "project-1", ss: "item-1" },
  ],
  [
    "character spritesheets",
    handleSpriteItemDoubleClick,
    "selectSpriteItemById",
    { p: "project-1", characterId: "character-1", sprite: "item-1" },
  ],
])("%s long press", (_name, handlePrimaryAction, itemSelector, payload) => {
  it("opens the spritesheet editor without showing the action sheet", () => {
    const item = { id: "item-1", type: "spritesheet", fileId: "file-1" };
    const state = createMobileResourcePageState();
    state.isTouchMode = true;
    const navigate = vi.fn();
    const pageDeps = {
      i18n: EN_I18N,
      store: {
        [itemSelector]: () => item,
        selectCharacterId: () => "character-1",
      },
      appService: {
        navigate,
        getPayload: () => ({
          p: "project-1",
          characterId: payload.characterId,
        }),
      },
    };
    const dispatchEvent = vi.fn((event) => {
      expect(event.type).toBe("item-dblclick");
      handlePrimaryAction(pageDeps, { _event: event });
    });

    handleMediaLongPress(
      { props: { mobileLayout: true }, dispatchEvent },
      {
        _event: {
          preventDefault: vi.fn(),
          currentTarget: { getAttribute: () => item.id },
        },
      },
    );

    expect(navigate).toHaveBeenCalledWith(
      "/project/spritesheet-editor",
      payload,
    );
    expect(
      buildMobileResourcePageViewData({ state }).showMobileDetailSheet,
    ).toBe(false);
  });
});
