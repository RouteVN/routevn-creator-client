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
  it("starts empty and offers only Web", () => {
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
      items: [{ label: "Web", type: "item", value: "web" }],
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
          applicationIdentifier: "",
          iconFileId: "project-icon-1",
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
        applicationIdentifier: "",
      },
      platformTabs: [],
    });
    expect(viewData.platformEditForm.title).toBe("Add Web Platform Details");
    expect(viewData.platformEditForm.actions.buttons).toEqual([
      {
        id: "submit",
        variant: "pr",
        validate: true,
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

  it("keeps native platform details out of the visible tabs", () => {
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
      hasPlatformDetails: false,
      platformTabs: [],
      selectedPlatform: undefined,
      selectedResourceId: "platformDetails",
    });
    expect(state.platformApplicationInfo.macos).toMatchObject({
      applicationName: "macOS Project",
      applicationIdentifier: "com.example.macos-project",
    });
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
          applicationIdentifier: "com.example.web-project",
          iconFileId: "web-icon-1",
          themeColorId: "color-theme",
          backgroundColorId: "color-background",
        },
      },
    );
    openPlatformEditDialog({ state });
    openAddPlatformMenu({ state, i18n: EN_I18N }, { x: 0, y: 0 });

    expect(state.platformEditDefaultValues).toMatchObject({
      applicationName: "Web Project",
      applicationIdentifier: "com.example.web-project",
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    });
    expect(state.platformEditIconFileId).toBe("web-icon-1");

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.addPlatformMenu.items).toEqual([]);
    expect(viewData.canAddPlatform).toBe(false);
    expect(viewData.platformEditForm.fields).toContainEqual(
      expect.objectContaining({
        name: "applicationIdentifier",
        required: true,
        description:
          EN_I18N.platformDetailsPage.webApplicationIdentifierDescription,
      }),
    );
    expect(viewData.platformDetailFields).toContainEqual({
      type: "text",
      label: "Application Identifier",
      value: "com.example.web-project",
    });
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
    expect(viewData.platformEditForm.actions.buttons).toEqual([
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: "Save Changes",
      },
    ]);

    setPlatformEditIconFileId({ state }, { iconFileId: "web-icon-2" });
    expect(state.platformEditIconFileId).toBe("web-icon-2");
  });
});
