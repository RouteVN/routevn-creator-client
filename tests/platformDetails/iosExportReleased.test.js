import { describe, expect, it, vi } from "vitest";
import { selectForm } from "../../node_modules/@rettangoli/ui/src/components/form/form.store.js";
import * as platformStore from "../../src/pages/platformDetails/platformDetails.store.js";
import * as versionsStore from "../../src/pages/versions/versions.store.js";
import { renderViewYaml } from "../support/renderView.js";
import { EN_I18N } from "../support/i18n.js";

// With IOS_EXPORT_RELEASED on, the Mac app offers iOS export, and the
// Android and iOS apps still do not.
vi.mock("../../src/internal/iosExport.js", async (importOriginal) => ({
  ...(await importOriginal()),
  IOS_EXPORT_RELEASED: true,
}));

const PLATFORM_COPY = EN_I18N.platformDetailsPage;
const VERSIONS_COPY = EN_I18N.versionsPage;

const createVersionsState = ({ platform, available }) => {
  const state = versionsStore.createInitialState();
  versionsStore.setPlatform({ state }, { platform });
  versionsStore.setVersions(
    { state },
    { versions: [{ id: "version-1", name: "1.2.3", actionIndex: 1 }] },
  );
  versionsStore.setSelectedItemId({ state }, { itemId: "version-1" });
  versionsStore.setIosExportAvailability(
    { state },
    { availability: { available } },
  );
  return state;
};

describe("iOS export switched on", () => {
  it("offers iOS in the desktop Platform Details", () => {
    const state = platformStore.createInitialState();
    platformStore.setPlatform({ state }, { platform: "tauri" });
    platformStore.openAddPlatformMenu({ state, i18n: EN_I18N }, {});
    expect(
      platformStore
        .selectViewData({ state, i18n: EN_I18N })
        .addPlatformMenu.items.map(({ value }) => value),
    ).toContain("ios");
  });

  it("leaves iOS out of the Android and iOS apps' Add menu", () => {
    const state = platformStore.createInitialState();
    platformStore.setPlatform({ state }, { platform: "ios" });
    expect(
      platformStore.selectCanAddPlatform({ state }, { platform: "ios" }),
    ).toBe(false);
  });

  it("shows the iOS tab with a 1024 px icon crop and the team kept", () => {
    const state = platformStore.createInitialState();
    platformStore.setPlatformApplicationInfo(
      { state },
      {
        platform: "ios",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.example.project-one",
          iconFileId: "icon-1",
          teamId: "ABCDE12345",
        },
      },
    );
    platformStore.openPlatformEditDialog({ state }, {});
    const viewData = platformStore.selectViewData({ state, i18n: EN_I18N });
    expect(viewData.platformTabs).toEqual([
      { id: "ios", label: PLATFORM_COPY.iosTabLabel },
    ]);
    expect(viewData.selectedPlatformTitle).toBe(
      PLATFORM_COPY.iosPlatformDetailsTitle,
    );
    expect(viewData.platformEditIconOutputSize).toBe(1024);
    expect(viewData.platformEditForm.title).toBe(
      PLATFORM_COPY.editIosPlatformDetailsTitle,
    );
    expect(
      viewData.platformEditForm.fields.find(
        ({ name }) => name === "applicationIdentifier",
      ),
    ).toMatchObject({
      label: PLATFORM_COPY.macosApplicationIdentifierLabel,
      description: PLATFORM_COPY.iosApplicationIdentifierDescription,
    });
    expect(state.platformApplicationInfo.ios.teamId).toBe("ABCDE12345");
  });

  it.each([
    ["tauri", true, true],
    ["tauri", false, false],
    ["web", true, false],
    ["android", true, false],
    ["ios", true, false],
  ])(
    "shows the Versions iOS button on %s when available is %s: %s",
    (platform, available, shown) => {
      const state = createVersionsState({ platform, available });
      const viewData = versionsStore.selectViewData({ state, i18n: EN_I18N });
      expect(viewData.canExportIosApplication).toBe(shown);
      const html = renderViewYaml(
        "src/pages/versions/versions.view.yaml",
        viewData,
      );
      expect(html.includes('id="detailIosApplicationBtn"')).toBe(shown);
    },
  );

  it("builds the export form from Xcode's teams and the devices", () => {
    const state = createVersionsState({ platform: "tauri", available: true });
    versionsStore.setIosExportOptions(
      { state },
      {
        teams: [
          { id: "COMPANY123", name: "Studio One", free: false },
          { id: "PERSONAL12", name: "A Person", free: true },
        ],
        devices: [{ id: "device-1", name: "iPad", model: "iPad mini" }],
      },
    );
    versionsStore.openExportConfirmation(
      { state },
      {
        exportType: "ios-application",
        platform: "ios",
        versionId: "version-1",
      },
    );
    const viewData = versionsStore.selectViewData({ state, i18n: EN_I18N });
    expect(viewData.showIosExportForm).toBe(true);
    expect(viewData.exportConfirmationTitle).toBe(
      VERSIONS_COPY.confirmIosExportTitle,
    );
    const fields = viewData.iosExportForm.fields;
    expect(fields.find(({ name }) => name === "teamId").options).toEqual([
      { value: "COMPANY123", label: "Studio One (COMPANY123)" },
      { value: "PERSONAL12", label: "A Person (Personal Team)" },
    ]);
    expect(fields.find(({ name }) => name === "deviceId").options).toEqual([
      { value: "none", label: VERSIONS_COPY.iosDontInstallOption },
      { value: "device-1", label: "iPad · iPad mini" },
    ]);
  });

  it("asks for a typed team ID when Xcode lists no teams", () => {
    const state = createVersionsState({ platform: "tauri", available: true });
    versionsStore.setIosExportOptions({ state }, { teams: [], devices: [] });
    versionsStore.openExportConfirmation(
      { state },
      {
        exportType: "ios-application",
        platform: "ios",
        versionId: "version-1",
      },
    );
    const { iosExportForm } = versionsStore.selectViewData({
      state,
      i18n: EN_I18N,
    });
    expect(iosExportForm.fields.find(({ name }) => name === "teamId")).toEqual({
      name: "teamId",
      type: "input-text",
      label: VERSIONS_COPY.iosTeamIdLabel,
      description: VERSIONS_COPY.iosTeamIdDescription,
      required: true,
    });
  });

  it.each([
    ["appStore", "upload", "deviceId"],
    ["development", "deviceId", "upload"],
  ])(
    "shows the %s fields when the form renders",
    (distribution, shownField, hiddenField) => {
      const state = createVersionsState({ platform: "tauri", available: true });
      versionsStore.setIosExportOptions(
        { state },
        {
          teams: [{ id: "COMPANY123", name: "Studio One", free: false }],
          devices: [{ id: "device-1", name: "iPad", model: "iPad mini" }],
        },
      );
      versionsStore.openExportConfirmation(
        { state },
        {
          exportType: "ios-application",
          platform: "ios",
          versionId: "version-1",
        },
      );
      const { iosExportForm } = versionsStore.selectViewData({
        state,
        i18n: EN_I18N,
      });
      const rendered = selectForm({
        state: { formValues: { distribution } },
        props: { form: iosExportForm },
      });
      const names = JSON.stringify(rendered.fields);
      expect(names).toContain(`"name":"${shownField}"`);
      expect(names).not.toContain(`"name":"${hiddenField}"`);
    },
  );
});
