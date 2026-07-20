import { describe, expect, it } from "vitest";
import {
  createInitialState,
  closeExportConfirmation,
  openExportConfirmation,
  selectExportConfirmation,
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

describe("versions store loading state", () => {
  it("keeps the initial empty collection in loading state until versions arrive", () => {
    const state = createInitialState();

    expect(selectViewData({ state })).toMatchObject({
      isVersionsLoading: true,
      loadingMessage: "Loading...",
      versions: [],
    });

    setVersions({ state }, { versions: [] });

    expect(selectViewData({ state })).toMatchObject({
      isVersionsLoading: false,
      noVersionsMessage: "No versions",
      versions: [],
    });
  });
});

describe("versions store export actions", () => {
  it("builds read-only Web export confirmation fields", () => {
    const state = createInitialState();

    openExportConfirmation(
      { state },
      {
        exportType: "web",
        platform: "web",
        versionId: "version-1",
        versionName: "Version 1",
        applicationInfo: {
          applicationName: "Web Edition",
          iconFileId: "web-icon",
          shortName: "Web",
          description: "Browser release",
          themeColorId: "color-theme",
          backgroundColorId: "color-background",
        },
        themeColor: "Accent (#112233)",
        backgroundColor: "Dark (#000000)",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.isExportConfirmationOpen).toBe(true);
    expect(viewData.exportConfirmationTitle).toBe("Confirm Web Export");
    expect(viewData.exportConfirmationIconFileId).toBe("web-icon");
    expect(viewData.exportConfirmationFields).toEqual(
      expect.arrayContaining([
        { type: "text", label: "Release Version", value: "Version 1" },
        { type: "text", label: "Application Name", value: "Web Edition" },
        { type: "text", label: "Theme Color", value: "Accent (#112233)" },
        {
          type: "text",
          label: "Background Color",
          value: "Dark (#000000)",
        },
      ]),
    );
    expect(selectExportConfirmation({ state })).toMatchObject({
      exportType: "web",
      platform: "web",
      versionId: "version-1",
    });

    closeExportConfirmation({ state });

    expect(selectViewData({ state }).exportConfirmationFields).toEqual([]);
  });

  it("shows macOS-specific metadata in the export confirmation", () => {
    const state = createInitialState();

    openExportConfirmation(
      { state },
      {
        exportType: "macos-application",
        platform: "macos",
        versionId: "version-1",
        versionName: "Version 1",
        applicationInfo: {
          applicationName: "Mac Edition",
          applicationIdentifier: "com.example.mac-edition",
          publisher: "Example Studio",
          description: "Mac release",
          copyright: "Copyright © 2026 Example Studio",
          category: "public.app-category.games",
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.exportConfirmationTitle).toBe("Confirm macOS App Export");
    expect(viewData.exportConfirmationFields).toEqual(
      expect.arrayContaining([
        {
          type: "text",
          label: "Bundle Identifier",
          value: "com.example.mac-edition",
        },
        {
          type: "text",
          label: "Application Category",
          value: "public.app-category.games",
        },
      ]),
    );
  });

  it("hides Windows exports in Tauri even when native exports are available", () => {
    const state = createInitialState();

    setPlatform({ state }, { platform: "tauri" });
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

  it("hides macOS application export on a supported macOS host", () => {
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

    expect(selectViewData({ state }).canExportMacosApplication).toBe(false);

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
    expect(selectViewData({ state }).canExportMacosApplication).toBe(false);

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

  it("keeps macOS export hidden in the visual workflow", () => {
    const state = createInitialState();

    setVisualTestMode({ state }, { enabled: true });

    expect(selectViewData({ state }).canExportMacosApplication).toBe(false);
  });
});
