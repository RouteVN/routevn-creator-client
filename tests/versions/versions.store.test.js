import { parseAndRender } from "jempl";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  closeExportConfirmation,
  openExportConfirmation,
  selectCanExportAndroidBundle,
  selectExportConfirmation,
  selectViewData,
  setAppWindowMetrics,
  setSelectedItemId,
  setPlatform,
  setAndroidExportAvailability,
  setAndroidSigningStatus,
  setMacosExportAvailability,
  setUiConfig,
  setVisualTestMode,
  setVersions,
  setWindowsExportAvailability,
} from "../../src/pages/versions/versions.store.js";
import { EN_I18N } from "../support/i18n.js";

// These tests cover Android export itself, which ships later; the
// unreleased state is covered in tests/platformDetails/androidExportUnreleased.test.js.
vi.mock("../../src/internal/androidExport.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ANDROID_EXPORT_RELEASED: true,
}));

const version = {
  id: "version-1",
  name: "Version 1",
  notes: "First release",
  actionIndex: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("versions store form", () => {
  it("uses the new-version title and a validated sticky-form action", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      i18n: EN_I18N,
    });

    expect(viewData.versionForm.title).toBe("New Version");
    expect(viewData.versionForm.fields[0]).toEqual({
      name: "name",
      type: "input-text",
      label: "Name",
      description: EN_I18N.versionsPage.nameDescription,
      required: true,
    });
    expect(viewData.versionForm.actions).toEqual({
      buttons: [
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label: "New Version",
        },
      ],
    });
  });
});

describe("versions store mobile view data", () => {
  it("centers the version list in the content column width in tablet landscape", () => {
    const state = createInitialState();
    setVersions({ state }, { versions: [version] });
    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    setAppWindowMetrics({ state }, { width: 390, height: 844 });
    expect(selectViewData({ state }).versionListStyle).toBe("");

    // As on the Projects, About, and Config pages: a 640px column.
    setAppWindowMetrics({ state }, { width: 1280, height: 800 });
    expect(selectViewData({ state }).versionListStyle).toBe(
      "padding-left: max(var(--spacing-md), calc((100% - 640px) / 2)); padding-right: max(var(--spacing-md), calc((100% - 640px) / 2));",
    );
  });

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
          applicationIdentifier: "com.example.web-edition",
          iconFileId: "web-icon",
        },
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
        {
          type: "text",
          label: "Application Identifier",
          value: "com.example.web-edition",
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

  it("shows current macOS metadata in the export confirmation", () => {
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
      ]),
    );
    expect(viewData.showMacosExportForm).toBe(true);
    expect(viewData.macosExportForm.fields).toEqual([
      {
        type: "row",
        fields: [
          expect.objectContaining({
            name: "version",
            label: "Version",
            required: true,
          }),
          expect.objectContaining({
            name: "buildNumber",
            label: "Build Number",
            required: true,
          }),
        ],
      },
    ]);
    expect(viewData.macosExportForm.actions.buttons).toEqual([
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: "Export macOS App (Beta)",
      },
    ]);
    expect(selectExportConfirmation({ state }).versionName).toBe("Version 1");
  });

  it("hides optional Windows metadata in the export confirmation", () => {
    const state = createInitialState();

    openExportConfirmation(
      { state },
      {
        exportType: "windows-executable",
        platform: "windows",
        versionId: "version-1",
        versionName: "Version 1",
        applicationInfo: {
          applicationName: "Windows Edition",
          applicationIdentifier: "com.example.windows-edition",
          iconFileId: "windows-icon",
          publisher: "Example Publisher",
          description: "Windows description",
          copyright: "Copyright Example Publisher",
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(
      viewData.exportConfirmationFields.map((field) => field.label),
    ).toEqual([
      "Release Version",
      "Application Name",
      "Icon",
      "Application Identifier",
    ]);
  });

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
    expect(viewData.exportWindowsExecutableButton).toBe(
      "Export Windows EXE (Beta)",
    );
    expect(viewData.exportWindowsInstallerButton).toBe(
      "Export Windows Installer (Beta)",
    );
  });

  it("shows Windows installer export when it is available", () => {
    const state = createInitialState();

    setPlatform({ state }, { platform: "tauri" });
    setWindowsExportAvailability(
      { state },
      {
        availability: {
          installer: true,
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.canExportWindowsExecutable).toBe(true);
    expect(viewData.canExportWindowsInstaller).toBe(true);
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

it.each(["web", "tauri", "android", "ios"])(
  "gates Android export on host capability for %s",
  (platform) => {
    const state = createInitialState();
    setPlatform({ state }, { platform });
    setVisualTestMode({ state }, { enabled: true });
    expect(selectViewData({ state }).canExportAndroidApk).toBe(false);
    setAndroidExportAvailability(
      { state },
      { availability: { available: true } },
    );
    expect(selectViewData({ state }).canExportAndroidApk).toBe(
      platform !== "web",
    );
    setAndroidExportAvailability(
      { state },
      { availability: { available: false } },
    );
    expect(selectViewData({ state }).canExportAndroidApk).toBe(false);
  },
);

it("shows Android release details, native version fields, and the unsigned signing notice", () => {
  const state = createInitialState();
  openExportConfirmation(
    { state },
    {
      exportType: "android-apk",
      platform: "android",
      versionId: "version-1",
      versionName: "Release One",
      applicationInfo: {
        applicationName: "Project One",
        applicationIdentifier: "com.example.project_one",
        iconFileId: "icon-1",
      },
    },
  );
  const view = selectViewData({ state, i18n: EN_I18N });
  expect(view.showAndroidExportForm).toBe(true);
  expect(view.showMacosExportForm).toBe(false);
  expect(view.exportConfirmationFields.map((field) => field.value)).toEqual([
    "Release One",
    "Project One",
    undefined,
    "com.example.project_one",
  ]);
  expect(
    view.androidExportForm.fields[0].fields.map((field) => field.name),
  ).toEqual(["version", "buildNumber"]);
  expect(view.androidExportForm.actions.buttons[0].label).toBe(
    EN_I18N.versionsPage.exportAndroidButton,
  );
  expect(view.androidUnsignedApkNotice).toBe(
    EN_I18N.versionsPage.androidUnsignedApkNotice,
  );
  // A host that cannot sign shows only the unsigned notice and no choices.
  expect(view.showAndroidUnsignedNotice).toBe(true);
  expect(view.androidExportForm.fields).toHaveLength(1);
});

const openAndroidExport = (state) =>
  openExportConfirmation(
    { state },
    {
      exportType: "android-apk",
      platform: "android",
      versionId: "version-1",
      versionName: "1.0.0",
      applicationInfo: {
        applicationName: "Project One",
        applicationIdentifier: "com.example.project_one",
        iconFileId: "icon-1",
      },
    },
  );

// Each field after Version and Build Number with the `$when` condition
// rtgl-form renders it under.
const describeSigningFields = (form) =>
  form.fields.slice(1).map((field) => ({
    when: field.$when,
    name: field.name,
    content: field.content,
    options: field.options?.map((option) => option.value),
  }));

// The names or notices rtgl-form shows for these values: it renders a field
// under `$if <$when>` with the values as `formValues`.
const visibleFields = (form, formValues) =>
  parseAndRender(
    {
      fields: form.fields
        .slice(1)
        .map(({ $when, ...field }) =>
          $when ? { [`$if ${$when}`]: field } : field,
        ),
    },
    { formValues },
  ).fields.map((field) => field.name ?? field.content);

describe("Android signing fields", () => {
  it("offers Signed and Unsigned and explains a new key for a game with none", () => {
    const state = createInitialState();
    openAndroidExport(state);
    setAndroidSigningStatus({ state }, { supported: true });
    const view = selectViewData({ state, i18n: EN_I18N });
    expect(view.showAndroidUnsignedNotice).toBe(false);
    const form = view.androidExportForm;
    expect(describeSigningFields(form)[0]).toMatchObject({
      name: "signing",
      options: ["signed", "unsigned"],
    });
    // The hint says who signs in each case.
    expect(form.fields[1].tooltip).toEqual({
      content: EN_I18N.versionsPage.androidSigningTooltip,
    });
    expect(visibleFields(form, { format: "apk", signing: "signed" })).toEqual([
      "signing",
      EN_I18N.versionsPage.androidNewKeyNotice,
    ]);
    expect(visibleFields(form, { format: "apk", signing: "unsigned" })).toEqual(
      ["signing", EN_I18N.versionsPage.androidUnsignedApkNotice],
    );
  });

  it("says the project's key signs and asks nothing else", () => {
    const state = createInitialState();
    openAndroidExport(state);
    setAndroidSigningStatus(
      { state },
      { supported: true, currentKey: "ab".repeat(32) },
    );
    const form = selectViewData({ state, i18n: EN_I18N }).androidExportForm;
    expect(
      describeSigningFields(form)
        .map((field) => field.name)
        .filter(Boolean),
    ).toEqual(["signing"]);
    expect(visibleFields(form, { format: "apk", signing: "signed" })).toEqual([
      "signing",
      EN_I18N.versionsPage.androidSignedWithKeyNotice,
    ]);
  });

  it("offers an App Bundle, always signed, when the host has the bundle template", () => {
    const state = createInitialState();
    openAndroidExport(state);
    setAndroidSigningStatus({ state }, { supported: true });
    setAndroidExportAvailability(
      { state },
      { availability: { available: true, bundleAvailable: true } },
    );
    expect(selectCanExportAndroidBundle({ state })).toBe(true);
    const form = selectViewData({ state, i18n: EN_I18N }).androidExportForm;
    expect(describeSigningFields(form)[0]).toMatchObject({
      name: "format",
      options: ["apk", "aab"],
    });
    // The hint says which format is for what.
    expect(form.fields[1].tooltip).toEqual({
      content: EN_I18N.versionsPage.androidFormatTooltip,
    });
    expect(visibleFields(form, { format: "apk", signing: "signed" })).toEqual([
      "format",
      "signing",
      EN_I18N.versionsPage.androidNewKeyNotice,
    ]);
    // Signing is not a choice for a bundle, whatever the APK choice was.
    expect(visibleFields(form, { format: "aab", signing: "unsigned" })).toEqual(
      [
        "format",
        EN_I18N.versionsPage.androidBundleNotice,
        EN_I18N.versionsPage.androidNewKeyNotice,
      ],
    );
  });

  it("offers no App Bundle without the bundle template or signing", () => {
    for (const [supported, bundleAvailable] of [
      [true, false],
      [false, true],
    ]) {
      const state = createInitialState();
      openAndroidExport(state);
      setAndroidSigningStatus({ state }, { supported });
      setAndroidExportAvailability(
        { state },
        { availability: { available: true, bundleAvailable } },
      );
      expect(selectCanExportAndroidBundle({ state })).toBe(false);
      const form = selectViewData({ state, i18n: EN_I18N }).androidExportForm;
      expect(form.fields.some((field) => field.name === "format")).toBe(false);
    }
  });

  it("shows no signing choice on a host that cannot sign", () => {
    const state = createInitialState();
    openAndroidExport(state);
    setAndroidSigningStatus({ state }, { supported: false });
    const view = selectViewData({ state, i18n: EN_I18N });
    expect(view.showAndroidUnsignedNotice).toBe(true);
    expect(describeSigningFields(view.androidExportForm)).toEqual([]);
  });
});
