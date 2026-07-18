import { describe, expect, it, vi } from "vitest";
import {
  handleAddPlatformMenuItemClick,
  handleAfterMount,
  handleBeforeMount,
  handlePlatformEditFormAction,
  handlePlatformEditIconCropDialogConfirm,
} from "../../src/pages/platformDetails/platformDetails.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = () => ({
  appService: {
    showAlert: vi.fn(),
    showToast: vi.fn(),
  },
  i18n: EN_I18N,
  projectService: {
    createCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetailsDefaults: vi.fn(),
    subscribeProjectState: vi.fn(),
    updateCurrentPlatformDetails: vi.fn(),
    uploadFiles: vi.fn(),
  },
  refs: {
    platformEditForm: {
      reset: vi.fn(),
      setValues: vi.fn(),
    },
    platformEditIconCropDialog: {
      getCroppedFile: vi.fn(),
    },
  },
  render: vi.fn(),
  store: {
    closeAddPlatformMenu: vi.fn(),
    closePlatformEditDialog: vi.fn(),
    closePlatformEditIconCropDialog: vi.fn(),
    openPlatformCreateDialog: vi.fn(),
    selectPlatformDialogState: vi.fn(() => ({
      mode: "edit",
      platform: "windows",
    })),
    selectColorIds: vi.fn(() => new Set(["color-theme", "color-background"])),
    selectPlatformEditDefaultValues: vi.fn(() => ({
      applicationName: "Project One",
    })),
    selectPlatformEditIconFileId: vi.fn(() => "windows-icon-1"),
    selectSelectedPlatform: vi.fn(() => "windows"),
    setColorsData: vi.fn(),
    setPlatformApplicationInfo: vi.fn(),
    setPlatformEditIconFileId: vi.fn(),
    setSelectedPlatform: vi.fn(),
    setUiConfig: vi.fn(),
  },
});

describe("platformDetails handlers", () => {
  it("keeps project color choices synchronized", () => {
    const deps = createDeps();
    const colorsData = {
      items: {
        "color-theme": {
          id: "color-theme",
          type: "color",
          name: "Ocean Blue",
          hex: "#112233",
        },
      },
      tree: [{ id: "color-theme" }],
    };
    const unsubscribe = vi.fn();
    deps.projectService.subscribeProjectState.mockImplementation((listener) => {
      listener({ repositoryState: { colors: colorsData } });
      return unsubscribe;
    });

    const cleanup = handleBeforeMount(deps);

    expect(deps.store.setColorsData).toHaveBeenCalledWith({ colorsData });
    expect(deps.render).toHaveBeenCalledTimes(1);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("keeps the page empty when no platform has been created", async () => {
    const deps = createDeps();
    deps.projectService.getCurrentPlatformDetails.mockResolvedValue(
      undefined,
    );

    await handleAfterMount(deps);

    expect(
      deps.projectService.getCurrentPlatformDetails,
    ).toHaveBeenCalledTimes(3);
    expect(deps.store.setPlatformApplicationInfo).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("loads only platform details that already exists", async () => {
    const deps = createDeps();
    deps.projectService.getCurrentPlatformDetails.mockImplementation(
      async (platform) => {
        if (platform !== "web") {
          return undefined;
        }
        const applicationInfo = {
          applicationName: `${platform} Project`,
          iconFileId: `${platform}-icon-1`,
        };
        return applicationInfo;
      },
    );

    await handleAfterMount(deps);

    expect(
      deps.projectService.getCurrentPlatformDetails,
    ).toHaveBeenCalledTimes(3);
    expect(deps.store.setPlatformApplicationInfo).toHaveBeenCalledWith({
      platform: "web",
      applicationInfo: {
        applicationName: "web Project",
        iconFileId: "web-icon-1",
      },
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens a prefilled create form from the add menu without persisting", async () => {
    const deps = createDeps();
    const applicationInfo = {
      applicationName: "Project One",
      iconFileId: "project-icon-1",
      shortName: "",
      description: "",
      themeColorId: "",
      backgroundColorId: "",
    };
    deps.projectService.getCurrentPlatformDetailsDefaults.mockResolvedValue(
      applicationInfo,
    );

    await handleAddPlatformMenuItemClick(deps, {
      _event: {
        detail: {
          item: { value: "web" },
        },
      },
    });

    expect(deps.store.closeAddPlatformMenu).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.getCurrentPlatformDetailsDefaults,
    ).toHaveBeenCalledWith("web");
    expect(deps.store.openPlatformCreateDialog).toHaveBeenCalledWith({
      platform: "web",
      applicationInfo,
    });
    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
    expect(deps.store.setPlatformApplicationInfo).not.toHaveBeenCalled();
    expect(deps.refs.platformEditForm.reset).toHaveBeenCalledTimes(1);
    expect(deps.refs.platformEditForm.setValues).toHaveBeenCalledWith({
      values: { applicationName: "Project One" },
    });
  });

  it("persists independently customized Windows platform details", async () => {
    const deps = createDeps();
    const applicationInfo = {
      applicationName: "Windows Project",
      iconFileId: "windows-icon-1",
      applicationIdentifier: "com.example.windows-project",
      publisher: "Example Publisher",
      description: "Windows description",
      copyright: "Copyright Example Publisher",
    };
    deps.projectService.updateCurrentPlatformDetails.mockResolvedValue(
      applicationInfo,
    );

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: " Windows Project ",
            applicationIdentifier: " com.example.windows-project ",
            publisher: " Example Publisher ",
            description: " Windows description ",
            copyright: " Copyright Example Publisher ",
          },
        },
      },
    });

    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("windows", applicationInfo);
    expect(deps.store.setPlatformApplicationInfo).toHaveBeenCalledWith({
      platform: "windows",
      applicationInfo,
    });
    expect(deps.store.closePlatformEditDialog).toHaveBeenCalledTimes(1);
  });

  it("requires an icon before saving native platform details", async () => {
    const deps = createDeps();
    deps.store.selectPlatformEditIconFileId.mockReturnValue(undefined);

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Windows Project",
            applicationIdentifier: "com.example.windows-project",
            publisher: "Example Publisher",
            description: "Windows description",
            copyright: "Copyright Example Publisher",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.nativeIconRequired,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("creates Web platform details from the submitted draft", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "create",
      platform: "web",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("web-icon-1");
    const applicationInfo = {
      applicationName: "Web Project",
      iconFileId: "web-icon-1",
      shortName: "Project",
      description: "Web description",
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    };
    deps.projectService.createCurrentPlatformDetails.mockResolvedValue(
      applicationInfo,
    );

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: " Web Project ",
            shortName: " Project ",
            description: " Web description ",
            themeColorId: " color-theme ",
            backgroundColorId: " color-background ",
          },
        },
      },
    });

    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).toHaveBeenCalledWith("web", applicationInfo);
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
    expect(deps.store.setSelectedPlatform).toHaveBeenCalledWith({
      platform: "web",
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.platformDetailsCreatedMessage,
    });
  });

  it("clears optional Web colors when the form omits their values", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "web",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("web-icon-1");
    deps.projectService.updateCurrentPlatformDetails.mockImplementation(
      async (_platform, patch) => patch,
    );

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Web Project",
            shortName: "Project",
            description: "Web description",
            themeColorId: undefined,
            backgroundColorId: undefined,
          },
        },
      },
    });

    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("web", {
      applicationName: "Web Project",
      iconFileId: "web-icon-1",
      shortName: "Project",
      description: "Web description",
      themeColorId: "",
      backgroundColorId: "",
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("cancels a platform draft without creating it", async () => {
    const deps = createDeps();

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "cancel",
        },
      },
    });

    expect(deps.store.closePlatformEditDialog).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("does not create macOS platform details without a bundle identifier", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "create",
      platform: "macos",
    });

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Project One",
            applicationIdentifier: "",
            publisher: "",
            description: "",
            copyright: "",
            category: "",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.macosApplicationIdentifierRequired,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("does not save Web platform details with a removed project color", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "web",
    });
    deps.store.selectColorIds.mockReturnValue(new Set());

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Project One",
            shortName: "",
            description: "",
            themeColorId: "color-removed",
            backgroundColorId: "",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.webThemeColorNotFound,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("uploads a cropped platform icon into platform edit state", async () => {
    const deps = createDeps();
    const croppedFile = { name: "windows-icon.png" };
    deps.refs.platformEditIconCropDialog.getCroppedFile.mockResolvedValue(
      croppedFile,
    );
    deps.projectService.uploadFiles.mockResolvedValue([
      { fileId: "windows-icon-2" },
    ]);

    await handlePlatformEditIconCropDialogConfirm(deps);

    expect(deps.store.setPlatformEditIconFileId).toHaveBeenCalledWith({
      iconFileId: "windows-icon-2",
    });
    expect(deps.store.closePlatformEditIconCropDialog).toHaveBeenCalledTimes(1);
  });
});
