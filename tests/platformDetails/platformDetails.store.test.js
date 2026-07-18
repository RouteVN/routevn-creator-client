import { describe, expect, it } from "vitest";
import {
  closePlatformEditDialog,
  createInitialState,
  openAddPlatformMenu,
  openPlatformCreateDialog,
  openPlatformEditDialog,
  selectViewData,
  setColorsData,
  setPlatformApplicationInfo,
  setPlatformEditIconFileId,
  setSelectedPlatform,
} from "../../src/pages/platformDetails/platformDetails.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("platformDetails.store", () => {
  it("starts empty and offers every uncreated platform", () => {
    const state = createInitialState();

    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData).toMatchObject({
      canAddPlatform: true,
      hasPlatformDetails: false,
      platformTabs: [],
      selectedPlatform: undefined,
    });

    openAddPlatformMenu({ state, i18n: EN_I18N }, { x: 100, y: 200 });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.addPlatformMenu).toEqual({
      isOpen: true,
      x: 100,
      y: 200,
      items: [
        { label: "Web", type: "item", value: "web" },
        { label: "Windows", type: "item", value: "windows" },
        { label: "macOS", type: "item", value: "macos" },
      ],
    });
  });

  it("opens a prefilled create form without creating a platform tab", () => {
    const state = createInitialState();
    openPlatformCreateDialog(
      { state },
      {
        platform: "web",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "project-icon-1",
          shortName: "",
          description: "",
          themeColorId: "",
          backgroundColorId: "",
        },
      },
    );

    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData).toMatchObject({
      hasPlatformDetails: false,
      isPlatformEditDialogOpen: true,
      platformDialogKey: "create-web",
      platformEditDefaultValues: {
        applicationName: "Project One",
      },
      platformTabs: [],
    });
    expect(viewData.platformEditForm.title).toBe("Add Web Platform Details");
    expect(viewData.platformEditForm.actions.buttons).toEqual([
      {
        id: "cancel",
        variant: "se",
        label: "Cancel",
      },
      {
        id: "submit",
        variant: "pr",
        label: "Add Platform",
      },
    ]);

    closePlatformEditDialog({ state });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData).toMatchObject({
      hasPlatformDetails: false,
      isPlatformEditDialogOpen: false,
      platformTabs: [],
    });
  });

  it("shows independently selected platform details", () => {
    const state = createInitialState();
    setPlatformApplicationInfo(
      { state },
      {
        platform: "macos",
        applicationInfo: {
          applicationName: "macOS Project",
          iconFileId: "macos-icon-1",
          applicationIdentifier: "com.example.macos-project",
          publisher: "Example Publisher",
          description: "macOS description",
          copyright: "Copyright Example Publisher",
          category: "public.app-category.games",
        },
      },
    );
    setSelectedPlatform({ state }, { platform: "macos" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData).toMatchObject({
      hasPlatformDetails: true,
      platformTabs: [{ id: "macos", label: "macOS" }],
      selectedPlatform: "macos",
      selectedPlatformTitle: "macOS Platform Details",
      platformApplicationIconFileId: "macos-icon-1",
      selectedResourceId: "platformDetails",
    });
    expect(viewData.platformDetailFields).toContainEqual({
      type: "text",
      label: "Application Category",
      value: "public.app-category.games",
    });
    expect(viewData.platformDetailFields).toContainEqual({
      type: "text",
      label: "Bundle Identifier",
      value: "com.example.macos-project",
    });
    expect(viewData.platformEditForm.fields).toContainEqual(
      expect.objectContaining({
        name: "applicationIdentifier",
        label: "Bundle Identifier",
        disabled: true,
        description:
          EN_I18N.platformDetailsPage.macosApplicationIdentifierDescription,
      }),
    );
  });

  it("prefills platform edit state independently", () => {
    const state = createInitialState();
    setColorsData(
      { state },
      {
        colorsData: {
          items: {
            "color-theme": {
              id: "color-theme",
              type: "color",
              name: "Ocean Blue",
              hex: "#112233",
            },
            "color-background": {
              id: "color-background",
              type: "color",
              name: "Night",
              hex: "#000000",
            },
          },
          tree: [{ id: "color-theme" }, { id: "color-background" }],
        },
      },
    );
    setPlatformApplicationInfo(
      { state },
      {
        platform: "web",
        applicationInfo: {
          applicationName: "Web Project",
          iconFileId: "web-icon-1",
          shortName: "Project",
          description: "Web description",
          themeColorId: "color-theme",
          backgroundColorId: "color-background",
        },
      },
    );
    openPlatformEditDialog({ state });
    openAddPlatformMenu({ state, i18n: EN_I18N }, { x: 0, y: 0 });

    expect(state.platformEditDefaultValues).toMatchObject({
      applicationName: "Web Project",
      shortName: "Project",
      description: "Web description",
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    });
    expect(state.platformEditIconFileId).toBe("web-icon-1");

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.addPlatformMenu.items.map((item) => item.value)).toEqual([
      "windows",
      "macos",
    ]);
    expect(
      viewData.platformEditForm.fields.some(
        (field) => field.name === "applicationIdentifier",
      ),
    ).toBe(false);
    expect(viewData.platformEditForm.fields).toContainEqual(
      expect.objectContaining({
        name: "themeColorId",
        type: "select",
        options: [
          { label: "Ocean Blue", value: "color-theme" },
          { label: "Night", value: "color-background" },
        ],
      }),
    );
    expect(viewData.platformDetailFields).toContainEqual({
      type: "text",
      label: "Theme Color",
      value: "Ocean Blue",
    });

    setPlatformEditIconFileId({ state }, { iconFileId: "web-icon-2" });
    expect(state.platformEditIconFileId).toBe("web-icon-2");
  });
});
