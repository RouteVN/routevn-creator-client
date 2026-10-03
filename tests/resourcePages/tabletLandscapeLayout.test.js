import { describe, expect, it, vi } from "vitest";
import {
  buildMobileResourcePageViewData,
  createMobileResourcePageState,
  mountMobileResourceWindowLayout,
  selectIsTabletLandscapeState,
  setMobileResourcePageWindowMetricsState,
  shouldSuppressMobileDetailSheetForFileExplorerSelection,
} from "../../src/internal/ui/resourcePages/mobileResourcePage.js";

const createState = ({ isTouchMode = true, width = 0, height = 0 } = {}) => {
  const state = createMobileResourcePageState();
  state.isTouchMode = isTouchMode;
  setMobileResourcePageWindowMetricsState(state, { width, height });
  return state;
};

describe("tablet landscape resource page layout", () => {
  it("shows the left explorer and hides the hamburger on touch landscape tablets", () => {
    const viewData = buildMobileResourcePageViewData({
      state: createState({ width: 1280, height: 800 }),
    });

    expect(viewData.showTabletLandscapeExplorer).toBe(true);
    expect(viewData.showMobileMenuButton).toBe(false);
    expect(viewData.showMobileFileExplorer).toBe(false);
    expect(viewData.showMobileTopTabs).toBe(true);
  });

  it("closes the explorer overlay when rotating into tablet landscape", () => {
    const state = createState({ width: 1280, height: 800 });
    state.isMobileFileExplorerOpen = true;

    expect(
      buildMobileResourcePageViewData({ state }).showMobileFileExplorer,
    ).toBe(false);
  });

  it.each([
    ["tablet portrait", { width: 800, height: 1280 }],
    ["phone portrait", { width: 390, height: 844 }],
    ["phone landscape", { width: 740, height: 360 }],
    ["metrics not received yet", { width: 0, height: 0 }],
  ])("keeps the hamburger and overlay explorer on %s", (_name, metrics) => {
    const state = createState(metrics);
    state.isMobileFileExplorerOpen = true;
    const viewData = buildMobileResourcePageViewData({ state });

    expect(viewData.showTabletLandscapeExplorer).toBe(false);
    expect(viewData.showMobileMenuButton).toBe(true);
    expect(viewData.showMobileFileExplorer).toBe(true);
  });

  it("does not change the desktop layout", () => {
    const viewData = buildMobileResourcePageViewData({
      state: createState({ isTouchMode: false, width: 1920, height: 1080 }),
    });

    expect(viewData.showTabletLandscapeExplorer).toBe(false);
    expect(viewData.showMobileMenuButton).toBe(false);
    expect(viewData.showExplorerPanel).toBe(true);
  });

  it("suppresses the detail sheet for explorer selections only while the explorer is visible", () => {
    const createDeps = (state) => ({
      store: {
        selectIsTouchMode: () => state.isTouchMode,
        selectIsMobileFileExplorerOpen: () => state.isMobileFileExplorerOpen,
        selectIsTabletLandscape: () => selectIsTabletLandscapeState({ state }),
      },
    });

    expect(
      shouldSuppressMobileDetailSheetForFileExplorerSelection(
        createDeps(createState({ width: 1280, height: 800 })),
      ),
    ).toBe(true);
    expect(
      shouldSuppressMobileDetailSheetForFileExplorerSelection(
        createDeps(createState({ width: 390, height: 844 })),
      ),
    ).toBe(false);
  });

  it("keeps the previous behavior for stores without window metrics", () => {
    const state = createState({ width: 390, height: 844 });
    state.isMobileFileExplorerOpen = true;

    expect(
      shouldSuppressMobileDetailSheetForFileExplorerSelection({
        store: {
          selectIsTouchMode: () => state.isTouchMode,
          selectIsMobileFileExplorerOpen: () => state.isMobileFileExplorerOpen,
        },
      }),
    ).toBe(true);
  });

  it("stores metrics and renders on each window change, then unsubscribes", () => {
    const unsubscribe = vi.fn();
    let publish;
    const windowMetricsClient = {
      subscribe: vi.fn((listener) => {
        publish = listener;
        return unsubscribe;
      }),
    };
    const store = { setAppWindowMetrics: vi.fn() };
    const render = vi.fn();

    const cleanup = mountMobileResourceWindowLayout({
      windowMetricsClient,
      store,
      render,
    });
    publish({ width: 1280, height: 800 });

    expect(store.setAppWindowMetrics).toHaveBeenCalledWith({
      width: 1280,
      height: 800,
    });
    expect(render).toHaveBeenCalledTimes(1);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without a window metrics client", () => {
    expect(
      mountMobileResourceWindowLayout({
        store: {},
        render: vi.fn(),
      }),
    ).toBeUndefined();
  });
});
