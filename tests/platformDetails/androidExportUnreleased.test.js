import { describe, expect, it, vi } from "vitest";
import { ANDROID_EXPORT_RELEASED } from "../../src/internal/androidExport.js";
import * as platformStore from "../../src/pages/platformDetails/platformDetails.store.js";
import * as versionsStore from "../../src/pages/versions/versions.store.js";
import { renderViewYaml } from "../support/renderView.js";
import { EN_I18N } from "../support/i18n.js";

// ANDROID_EXPORT_RELEASED can switch Android export off again; with it off, no
// page offers it.
vi.mock("../../src/internal/androidExport.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ANDROID_EXPORT_RELEASED: false,
}));

describe("Android export switched off", () => {
  it("reads the switch as off", () => {
    expect(ANDROID_EXPORT_RELEASED).toBe(false);
  });

  it.each(["web", "tauri", "android", "ios"])(
    "hides the Versions export action on %s, even when the host can export",
    (platform) => {
      const state = versionsStore.createInitialState();
      versionsStore.setPlatform({ state }, { platform });
      versionsStore.setAndroidExportAvailability(
        { state },
        { availability: { available: true } },
      );

      expect(versionsStore.selectViewData({ state }).canExportAndroidApk).toBe(
        false,
      );
    },
  );

  it.each([false, true])(
    "leaves the Android button out of the rendered Versions page (touch: %s)",
    (isTouch) => {
      const state = versionsStore.createInitialState();
      versionsStore.setPlatform({ state }, { platform: "tauri" });
      versionsStore.setUiConfig(
        { state },
        { uiConfig: { id: isTouch ? "touch" : "normal" } },
      );
      versionsStore.setAppWindowMetrics(
        { state },
        { width: isTouch ? 390 : 1440, height: 900 },
      );
      versionsStore.setVersions(
        { state },
        { versions: [{ id: "version-1", name: "1.2.3", actionIndex: 1 }] },
      );
      versionsStore.setSelectedItemId({ state }, { itemId: "version-1" });
      versionsStore.setAndroidExportAvailability(
        { state },
        { availability: { available: true } },
      );

      const html = renderViewYaml(
        "src/pages/versions/versions.view.yaml",
        versionsStore.selectViewData({ state, i18n: EN_I18N }),
      );

      expect(html).toContain('id="detailDownloadBtn"');
      expect(html).not.toContain('id="detailAndroidApkBtn"');
      expect(html).not.toContain(EN_I18N.versionsPage.exportAndroidApkButton);
    },
  );

  it("offers Web, Windows and macOS in the desktop Platform Details", () => {
    const state = platformStore.createInitialState();
    platformStore.setPlatform({ state }, { platform: "tauri" });

    platformStore.openAddPlatformMenu({ state, i18n: EN_I18N }, {});

    expect(
      platformStore.selectViewData({ state, i18n: EN_I18N }).addPlatformMenu
        .items,
    ).toEqual([
      { label: "Web", type: "item", value: "web" },
      { label: "Windows", type: "item", value: "windows" },
      { label: "macOS", type: "item", value: "macos" },
    ]);
    expect(
      platformStore.selectCanAddPlatform({ state }, { platform: "android" }),
    ).toBe(false);
  });

  it.each(["android", "ios"])(
    "offers only Web in the %s app's Platform Details",
    (platform) => {
      const state = platformStore.createInitialState();
      platformStore.setPlatform({ state }, { platform });

      platformStore.openAddPlatformMenu({ state, i18n: EN_I18N }, {});
      expect(
        platformStore.selectViewData({ state, i18n: EN_I18N }).addPlatformMenu
          .items,
      ).toEqual([{ label: "Web", type: "item", value: "web" }]);

      platformStore.setPlatformApplicationInfo(
        { state },
        {
          platform: "web",
          applicationInfo: { applicationName: "Project One" },
        },
      );
      expect(
        platformStore.selectViewData({ state, i18n: EN_I18N }).canAddPlatform,
      ).toBe(false);
    },
  );

  it("does not show saved Android details as a tab", () => {
    const state = platformStore.createInitialState();
    platformStore.setPlatformApplicationInfo(
      { state },
      {
        platform: "android",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.example.project_one",
        },
      },
    );
    platformStore.setSelectedPlatform({ state }, { platform: "android" });

    const viewData = platformStore.selectViewData({ state, i18n: EN_I18N });
    expect(viewData.platformTabs).toEqual([]);
    expect(viewData.selectedPlatform).toBeUndefined();
    expect(viewData.hasPlatformDetails).toBe(false);
  });
});
