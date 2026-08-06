import { describe, expect, it } from "vitest";
import {
  closePlatformEditDialog,
  createInitialState,
  openAddPlatformMenu,
  openPlatformCreateDialog,
  openPlatformEditDialog,
  selectViewData,
  setPlatformApplicationInfo,
  setSelectedPlatform,
} from "../../src/pages/platformDetails/platformDetails.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("platformDetails.store", () => {
  it("starts empty and offers every supported platform", () => {
    const state = createInitialState();

    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData).toMatchObject({
      canAddPlatform: true,
      hasPlatformDetails: false,
      platformEditIconOutputSize: 256,
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
          applicationIdentifier: "",
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

  it("requires the Windows application identifier in the platform form", () => {
    const state = createInitialState();
    openPlatformCreateDialog(
      { state },
      {
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "",
          iconFileId: "windows-icon-1",
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.platformEditForm.fields).toContainEqual(
      expect.objectContaining({
        name: "applicationIdentifier",
        required: true,
        description:
          EN_I18N.platformDetailsPage.windowsApplicationIdentifierDescription,
      }),
    );
  });

  it("shows native platform details in the visible tabs", () => {
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
      selectedResourceId: "platformDetails",
    });
    expect(state.platformApplicationInfo.macos).toMatchObject({
      applicationName: "macOS Project",
      applicationIdentifier: "com.example.macos-project",
    });
    expect(state.platformApplicationInfo.macos).not.toHaveProperty(
      "applicationVersion",
    );
    for (const field of ["publisher", "description", "copyright", "category"]) {
      expect(state.platformApplicationInfo.macos).not.toHaveProperty(field);
    }
    expect(viewData.platformDetailFields).toHaveLength(3);

    openPlatformEditDialog({ state });
    const editViewData = selectViewData({ state, i18n: EN_I18N });
    expect(editViewData.platformEditDefaultValues).not.toHaveProperty(
      "applicationVersion",
    );
    expect(editViewData.platformEditForm.fields).not.toContainEqual(
      expect.objectContaining({ name: "applicationVersion" }),
    );
    expect(
      editViewData.platformEditForm.fields
        .map((field) => field.name)
        .filter(Boolean),
    ).toEqual(["applicationName", "applicationIdentifier"]);
  });

  it("prefills platform edit state independently", () => {
    const state = createInitialState();
    setPlatformApplicationInfo(
      { state },
      {
        platform: "web",
        applicationInfo: {
          applicationName: "Web Project",
          applicationIdentifier: "com.example.web-project",
          iconFileId: "web-icon-1",
        },
      },
    );
    openPlatformEditDialog({ state });
    openAddPlatformMenu({ state, i18n: EN_I18N }, { x: 0, y: 0 });

    expect(state.platformEditDefaultValues).toMatchObject({
      applicationName: "Web Project",
      applicationIdentifier: "com.example.web-project",
    });
    expect(state.platformEditIconFileId).toBeUndefined();

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.addPlatformMenu.items).toEqual([
      { label: "Windows", type: "item", value: "windows" },
      { label: "macOS", type: "item", value: "macos" },
    ]);
    expect(viewData.canAddPlatform).toBe(true);
    expect(viewData.platformEditForm.fields).toContainEqual(
      expect.objectContaining({
        name: "applicationIdentifier",
        required: true,
        description:
          EN_I18N.platformDetailsPage.webApplicationIdentifierDescription,
      }),
    );
    expect(viewData.platformDetailFields).toEqual([
      {
        type: "slot",
        slot: "platform-application-name",
        label: "Application Name",
      },
      {
        type: "slot",
        slot: "platform-application-identifier",
        label: "Application Identifier",
      },
    ]);
    expect(viewData).toMatchObject({
      platformApplicationName: "Web Project",
      platformApplicationIdentifier: "com.example.web-project",
      showPlatformApplicationIcon: false,
      showPlatformEditIcon: false,
    });
    expect(viewData.platformEditForm.fields).toHaveLength(2);
    expect(viewData.platformEditForm.actions.buttons).toEqual([
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: "Save Changes",
      },
    ]);
  });
});
