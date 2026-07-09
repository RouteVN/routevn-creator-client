import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openMobileSheet,
  selectViewData,
  setPlatform,
  setRepositoryLoading,
  setRepositoryLoadingPhase,
  setRepositoryLoadingProgress,
  setUiConfig,
} from "../../src/pages/app/app.store.js";

const selectMobileTab = ({ state, tabId }) => {
  return selectViewData({ state }).mobileTabBarItems.find(
    (item) => item.id === tabId,
  );
};

describe("app.store repository loading progress", () => {
  it("resolves the variables resource route", () => {
    const state = createInitialState();
    state.currentRoute = "/project/variables";

    expect(selectViewData({ state }).currentRoutePattern).toBe(
      "/project/variables",
    );
  });

  it("resolves the appearance route", () => {
    const state = createInitialState();
    state.currentRoute = "/project/appearance";

    expect(selectViewData({ state }).currentRoutePattern).toBe(
      "/project/appearance",
    );
  });

  it("derives a percentage-based loading message and bar width", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingPhase(
      { state },
      {
        phase: "Building project state...",
      },
    );
    setRepositoryLoadingProgress(
      { state },
      {
        current: 128,
        total: 256,
      },
    );

    expect(selectViewData({ state })).toMatchObject({
      isRepositoryLoading: true,
      hasRepositoryLoadingProgress: true,
      repositoryLoadingProgressPercent: 50,
      repositoryLoadingProgressWidth: "50%",
      repositoryLoadingStatusText: "Loading project... 50%",
    });
  });

  it("keeps a stable loading message before progress exists", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingPhase(
      { state },
      {
        phase: "Opening project database...",
      },
    );

    expect(selectViewData({ state })).toMatchObject({
      isRepositoryLoading: true,
      hasRepositoryLoadingProgress: false,
      repositoryLoadingStatusText: "Loading project...",
    });
  });

  it("clamps loading progress to the reported total", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingProgress(
      { state },
      {
        current: 600,
        total: 512,
      },
    );

    expect(state.repositoryLoadingCurrent).toBe(512);
    expect(state.repositoryLoadingTotal).toBe(512);
    expect(selectViewData({ state }).repositoryLoadingProgressPercent).toBe(
      100,
    );
  });

  it("keeps 100% progress when a later phase clears progress values", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingProgress(
      { state },
      {
        current: 512,
        total: 512,
      },
    );
    setRepositoryLoadingProgress(
      { state },
      {
        current: 0,
        total: 0,
      },
    );

    expect(state.repositoryLoadingCurrent).toBe(512);
    expect(state.repositoryLoadingTotal).toBe(512);
    expect(selectViewData({ state })).toMatchObject({
      hasRepositoryLoadingProgress: true,
      repositoryLoadingProgressPercent: 100,
      repositoryLoadingStatusText: "Loading project... 100%",
    });
  });
});

describe("app.store mobile tab active state", () => {
  it("highlights the assets tab on resource routes", () => {
    const state = createInitialState();
    state.currentRoute = "/project/images";

    expect(selectMobileTab({ state, tabId: "assets" }).color).toBe("white");
    expect(selectMobileTab({ state, tabId: "scene-map" }).color).toBe("mu-fg");
  });

  it("highlights the scene map tab on scene routes", () => {
    const state = createInitialState();
    state.currentRoute = "/project/scene-editor";

    expect(selectMobileTab({ state, tabId: "scene-map" }).color).toBe("white");
    expect(selectMobileTab({ state, tabId: "assets" }).color).toBe("mu-fg");
  });

  it("highlights the release tab on release routes", () => {
    const state = createInitialState();
    state.currentRoute = "/project/releases/versions";

    expect(selectMobileTab({ state, tabId: "release" }).color).toBe("white");
    expect(selectMobileTab({ state, tabId: "assets" }).color).toBe("mu-fg");
  });

  it("highlights the settings tab on settings routes", () => {
    const state = createInitialState();
    state.currentRoute = "/project/about";

    expect(selectMobileTab({ state, tabId: "settings" }).color).toBe("white");
    expect(selectMobileTab({ state, tabId: "assets" }).color).toBe("mu-fg");
  });

  it("highlights the open mobile sheet tab over the current route", () => {
    const state = createInitialState();
    state.currentRoute = "/project/images";

    openMobileSheet({ state }, { variant: "release" });

    expect(selectMobileTab({ state, tabId: "release" }).color).toBe("white");
    expect(selectMobileTab({ state, tabId: "assets" }).color).toBe("mu-fg");
  });
});

describe("app.store help button position", () => {
  it("keeps the desktop help button near the bottom edge", () => {
    const state = createInitialState();

    expect(selectViewData({ state }).helpButtonBottom).toBe("24px");
  });

  it("places the Android touch help button below the iOS-safe position", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    setPlatform({ state }, { platform: "android" });

    expect(selectViewData({ state }).helpButtonBottom).toBe("80px");
  });

  it("keeps the iOS touch help button above the tab bar safe area", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    setPlatform({ state }, { platform: "ios" });

    expect(selectViewData({ state }).helpButtonBottom).toBe(
      "calc(128px + var(--rvn-mobile-safe-area-inset-bottom, 0px))",
    );
  });
});
