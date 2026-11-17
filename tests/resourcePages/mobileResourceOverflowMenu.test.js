import { describe, expect, it, vi } from "vitest";
import * as mediaStore from "../../src/components/mediaResourcesView/mediaResourcesView.store.js";
import * as mediaHandlers from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import * as catalogStore from "../../src/components/catalogResourcesView/catalogResourcesView.store.js";
import * as catalogHandlers from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";
import * as charactersStore from "../../src/components/charactersResourcesView/charactersResourcesView.store.js";
import * as charactersHandlers from "../../src/components/charactersResourcesView/charactersResourcesView.handlers.js";
import * as textStylesStore from "../../src/components/textStyleResourcesView/textStyleResourcesView.store.js";
import * as textStylesHandlers from "../../src/components/textStyleResourcesView/textStyleResourcesView.handlers.js";
import * as variablesStore from "../../src/components/groupVariablesView/groupVariablesView.store.js";
import * as variablesHandlers from "../../src/components/groupVariablesView/groupVariablesView.handlers.js";
import * as importStore from "../../src/components/resourceImportAction/resourceImportAction.store.js";
import { handleMenuItemClick } from "../../src/components/resourceImportAction/resourceImportAction.handlers.js";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const families = [
  ["media", mediaStore, mediaHandlers, true],
  ["catalog", catalogStore, catalogHandlers, true],
  ["characters", charactersStore, charactersHandlers, false],
  ["text styles", textStylesStore, textStylesHandlers, true],
  ["variables", variablesStore, variablesHandlers, false],
];

const createProps = (mobileLayout, supportsZoom) => ({
  mobileLayout,
  showZoomControls: supportsZoom,
  zoomControlMode: "columns",
  showTagFilter: true,
  selectedTagFilterValues: ["tag-one"],
  searchInFilterPopover: true,
  showMenuButton: true,
  menuButtonPlacement: "trailing",
  groups: [],
  flatGroups: [],
});

describe.each(families)(
  "%s resource overflow menu",
  (_name, componentStore, handlers, supportsZoom) => {
    it("keeps the mobile header compact while preserving available actions", () => {
      const props = createProps(true, supportsZoom);
      const state = componentStore.createInitialState({ props });
      const view = componentStore.selectViewData({
        state,
        props,
        i18n: EN_I18N,
      });
      const menu = importStore.selectViewData({
        state: importStore.createInitialState(),
        props: { additionalMenuItems: view.resourceImportMenuItems },
        i18n: EN_I18N,
      });

      expect(view.showTrailingMenuButton).toBe(true);
      expect(view.showTagFilter).toBe(false);
      expect(view.showSearch).toBe(false);
      expect(view.showZoomPopoverButton).toBeFalsy();
      expect(menu.menu.items.map(({ value }) => value)).toEqual(
        supportsZoom ? ["zoom", "filter", "import"] : ["filter", "import"],
      );
      expect(menu.menuLabel).toBe("Actions");
    });

    it("keeps desktop zoom and filters in the header", () => {
      const props = createProps(false, supportsZoom);
      const state = componentStore.createInitialState({ props });
      const view = componentStore.selectViewData({
        state,
        props,
        i18n: EN_I18N,
      });

      expect(view.showTagFilter).toBe(true);
      expect(view.resourceImportMenuItems).toEqual([]);
      if (supportsZoom) expect(view.showZoomPopoverButton).toBe(true);
    });

    it("hands menu actions to their popovers with the menu anchor and current filters", () => {
      const props = createProps(true, supportsZoom);
      const state = componentStore.createInitialState({ props });
      const view = componentStore.selectViewData({
        state,
        props,
        i18n: EN_I18N,
      });
      const menuState = importStore.createInitialState();
      const position = { x: 300, y: 48 };
      const render = vi.fn();
      const store = {
        openTagFilterPopover: (payload) =>
          componentStore.openTagFilterPopover({ state }, payload),
      };
      if (supportsZoom) {
        store.openZoomPopover = (payload) =>
          componentStore.openZoomPopover({ state }, payload);
      }

      for (const item of view.resourceImportMenuItems) {
        importStore.openMenu({ state: menuState }, position);
        handleMenuItemClick(
          {
            store: {
              selectMenuPosition: () =>
                importStore.selectMenuPosition({ state: menuState }),
              closeMenu: () => importStore.closeMenu({ state: menuState }),
            },
            render: vi.fn(),
            dispatchEvent: (event) => {
              expect(menuState.isMenuOpen).toBe(false);
              handlers.handleResourceImportMenuAction(
                { store, props, render },
                { _event: event },
              );
            },
          },
          { _event: { detail: { item } } },
        );
      }

      expect(state.tagFilterPopover).toMatchObject({
        isOpen: true,
        position,
        draftTagIds: ["tag-one"],
      });
      if (supportsZoom) {
        expect(state.zoomPopover).toMatchObject({ isOpen: true, position });
      }
      expect(render).toHaveBeenCalledTimes(supportsZoom ? 2 : 1);
    });

    it.each([
      [EN_I18N, "Zoom", "Filter"],
      [JA_I18N, "ズーム", "絞り込み"],
      [ZH_HANS_I18N, "缩放", "筛选"],
    ])("localizes the available menu actions", (i18n, zoom, filter) => {
      const props = createProps(true, supportsZoom);
      const state = componentStore.createInitialState({ props });
      const view = componentStore.selectViewData({ state, props, i18n });

      expect(view.resourceImportMenuItems.map(({ label }) => label)).toEqual(
        supportsZoom ? [zoom, filter] : [filter],
      );
    });
  },
);
