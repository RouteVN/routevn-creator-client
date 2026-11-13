import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import * as platformStore from "../../src/pages/platformDetails/platformDetails.store.js";
import * as versionsStore from "../../src/pages/versions/versions.store.js";
import { renderViewYaml } from "../support/renderView.js";
import { EN_I18N } from "../support/i18n.js";

// These tests cover Android export itself, which ships later; the
// unreleased state is covered in tests/platformDetails/androidExportUnreleased.test.js.
vi.mock("../../src/internal/androidExport.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ANDROID_EXPORT_RELEASED: true,
}));

const applicationInfo = {
  applicationName: "Project One",
  applicationIdentifier: "com.example.project_one",
  iconFileId: "icon-1",
  iconBackgroundColor: "#ABCDEF",
  splashBackgroundColor: "#123456",
};

describe("Android export views", () => {
  it("renders both launcher masks and the fitted splash icon on their background colors", () => {
    const state = platformStore.createInitialState();
    platformStore.setPlatformApplicationInfo(
      { state },
      { platform: "android", applicationInfo },
    );
    const dom = new JSDOM(
      renderViewYaml(
        "src/pages/platformDetails/platformDetails.view.yaml",
        platformStore.selectViewData({ state, i18n: EN_I18N }),
      ),
    );
    const preview = dom.window.document.querySelector(
      '[slot="android-previews"]',
    );
    expect(preview.textContent).toContain(
      EN_I18N.platformDetailsPage.androidLauncherPreviewLabel,
    );
    expect(
      preview.querySelectorAll('div[style*="border-radius: 50%"]'),
    ).toHaveLength(2);
    expect(
      preview.querySelector('div[style*="border-radius: 24px"]').style
        .backgroundColor,
    ).toBe("rgb(171, 205, 239)");
    expect(
      preview.querySelector('div[style*="width: 200px"]').style.backgroundColor,
    ).toBe("rgb(18, 52, 86)");
    expect(preview.querySelectorAll("rvn-file-image")).toHaveLength(3);
    dom.window.close();
  });

  it.each([false, true])(
    "gates the action in the rendered layout (touch: %s)",
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
      const render = () =>
        renderViewYaml(
          "src/pages/versions/versions.view.yaml",
          versionsStore.selectViewData({ state, i18n: EN_I18N }),
        );
      expect(render()).not.toContain('id="detailAndroidApkBtn"');
      versionsStore.setAndroidExportAvailability(
        { state },
        { availability: { available: true } },
      );
      const html = render();
      expect(html).toContain('id="detailAndroidApkBtn"');
      expect(html).toContain(EN_I18N.versionsPage.exportAndroidApkButton);
      versionsStore.openExportConfirmation(
        { state },
        {
          exportType: "android-apk",
          platform: "android",
          versionId: "version-1",
          versionName: "1.2.3",
          applicationInfo,
        },
      );
      const dialogHtml = render();
      expect(dialogHtml).toContain('id="androidExportForm"');
      const dialog = new JSDOM(dialogHtml);
      expect(dialog.window.document.body.textContent).toContain(
        EN_I18N.versionsPage.androidUnsignedApkNotice,
      );
      dialog.window.close();
      expect(dialogHtml).not.toContain('id="exportConfirmationConfirmButton"');
    },
  );
});
