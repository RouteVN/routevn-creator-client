import { describe, expect, it } from "vitest";
import {
  closeMobileFileExplorer,
  createInitialState,
  openMobileFileExplorer,
  selectIsMobileFileExplorerOpen,
  selectViewData,
  setShowSceneForm,
  setTouchMinimapReady,
  setUiConfig,
  setWhiteboardConnectionsReady,
} from "../../src/pages/scenes/scenes.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("scenes.store mobile layout", () => {
  it("shows the mobile explorer controls and top-left minimap settings in touch mode", () => {
    const state = createInitialState();
    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
          inputMode: "touch",
        },
      },
    );

    openMobileFileExplorer({ state });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(selectIsMobileFileExplorerOpen({ state })).toBe(true);
    expect(viewData.showExplorerPanel).toBe(false);
    expect(viewData.showDetailPanel).toBe(false);
    expect(viewData.showMobileScenesControls).toBe(true);
    expect(viewData.showMobileFileExplorer).toBe(true);
    expect(viewData.showWhiteboardMinimapInTouchMode).toBe(false);
    expect(viewData.showWhiteboardConnections).toBe(false);
    expect(viewData.whiteboardMinimapPlacement).toBe("top-left");
    expect(viewData.whiteboardMinimapHeightScale).toBe(2 / 3);

    setTouchMinimapReady({ state }, { isReady: true });
    setWhiteboardConnectionsReady({ state }, { isReady: true });

    const hydratedViewData = selectViewData({ state, i18n: EN_I18N });
    expect(hydratedViewData.showWhiteboardMinimapInTouchMode).toBe(true);
    expect(hydratedViewData.showWhiteboardConnections).toBe(true);

    closeMobileFileExplorer({ state });

    expect(selectIsMobileFileExplorerOpen({ state })).toBe(false);
    expect(
      selectViewData({ state, i18n: EN_I18N }).showMobileFileExplorer,
    ).toBe(false);
  });

  it("keeps desktop panels and bottom-left minimap settings outside touch mode", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.showExplorerPanel).toBe(true);
    expect(viewData.showDetailPanel).toBe(true);
    expect(viewData.showMobileScenesControls).toBe(false);
    expect(viewData.showMobileFileExplorer).toBe(false);
    expect(viewData.showWhiteboardMinimapInTouchMode).toBe(false);
    expect(viewData.whiteboardMinimapPlacement).toBe("bottom-left");
    expect(viewData.whiteboardMinimapHeightScale).toBe(1);
  });

  it("uses a popover on desktop and a dialog on touch for scene creation", () => {
    const state = createInitialState();

    setShowSceneForm({ state }, { show: true });

    const desktopViewData = selectViewData({ state, i18n: EN_I18N });
    expect(desktopViewData.showSceneFormPopover).toBe(true);
    expect(desktopViewData.showSceneFormDialog).toBe(false);

    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
          inputMode: "touch",
        },
      },
    );

    const touchViewData = selectViewData({ state, i18n: EN_I18N });
    expect(touchViewData.showSceneFormPopover).toBe(false);
    expect(touchViewData.showSceneFormDialog).toBe(true);
  });
});
