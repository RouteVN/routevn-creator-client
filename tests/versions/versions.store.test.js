import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSelectedItemId,
  setPlatform,
  setMacosExportAvailability,
  setUiConfig,
  setVisualTestMode,
  setVersions,
  setWindowsExportAvailability,
} from "../../src/pages/versions/versions.store.js";

const version = {
  id: "version-1",
  name: "Version 1",
  notes: "First release",
  actionIndex: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("versions store mobile view data", () => {
  it("shows the selected version in a mobile detail sheet in touch mode", () => {
    const state = createInitialState();

    setVersions({ state }, { versions: [version] });
    setSelectedItemId({ state }, { itemId: "version-1" });
    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
          inputMode: "touch",
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.showExplorerPanel).toBe(false);
    expect(viewData.showDetailPanel).toBe(false);
    expect(viewData.showMobileDetailSheet).toBe(true);
    expect(viewData.contentLeftPadding).toBe("0");
    expect(viewData.selectedItemName).toBe("Version 1");
    expect(viewData.mobileDetailFields).toEqual(viewData.detailFields);
    expect(
      viewData.mobileDetailFields.some((field) => field.slot === "actions"),
    ).toBe(true);
  });

  it("keeps the desktop detail panel outside touch mode", () => {
    const state = createInitialState();

    setVersions({ state }, { versions: [version] });
    setSelectedItemId({ state }, { itemId: "version-1" });

    const viewData = selectViewData({ state });

    expect(viewData.showExplorerPanel).toBe(true);
    expect(viewData.showDetailPanel).toBe(true);
    expect(viewData.showMobileDetailSheet).toBe(false);
    expect(viewData.contentLeftPadding).toBe("sm");
  });
});

describe("versions store export actions", () => {
  it("shows Windows EXE export in Tauri without hiding it behind resource preflight", () => {
    const state = createInitialState();

    setPlatform({ state }, { platform: "tauri" });
    setWindowsExportAvailability(
      { state },
      {
        availability: {
          portableExecutable: false,
          installer: false,
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.canExportWindowsExecutable).toBe(true);
    expect(viewData.canExportWindowsInstaller).toBe(false);
  });

  it("hides Windows exports in web runtime", () => {
    const state = createInitialState();

    setWindowsExportAvailability(
      { state },
      {
        availability: {
          portableExecutable: true,
          installer: true,
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.canExportWindowsExecutable).toBe(false);
    expect(viewData.canExportWindowsInstaller).toBe(false);
  });

  it("keeps macOS application export visible on a macOS host when preflight fails", () => {
    const state = createInitialState();
    setPlatform({ state }, { platform: "tauri" });
    setMacosExportAvailability(
      { state },
      {
        availability: {
          application: true,
          templateAvailable: true,
          hostSupported: true,
        },
      },
    );

    expect(selectViewData({ state }).canExportMacosApplication).toBe(true);

    setMacosExportAvailability(
      { state },
      {
        availability: {
          application: false,
          templateAvailable: false,
          hostSupported: true,
        },
      },
    );
    expect(selectViewData({ state }).canExportMacosApplication).toBe(true);

    setMacosExportAvailability(
      { state },
      {
        availability: {
          application: false,
          templateAvailable: true,
          hostSupported: false,
        },
      },
    );
    expect(selectViewData({ state }).canExportMacosApplication).toBe(false);
  });

  it("exposes the macOS action to the visual workflow without native tools", () => {
    const state = createInitialState();

    setVisualTestMode({ state }, { enabled: true });

    expect(selectViewData({ state }).canExportMacosApplication).toBe(true);
  });
});
