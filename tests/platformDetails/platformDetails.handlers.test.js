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
  uiConfig: { id: "normal", inputMode: "pointer" },
  projectService: {
    createCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetailsDefaults: vi.fn(),
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
    selectPlatformEditDefaultValues: vi.fn(() => ({
      applicationName: "Project One",
    })),
    selectPlatformEditIconFileId: vi.fn(() => "windows-icon-1"),
    selectSelectedPlatform: vi.fn(() => "windows"),
    setPlatformApplicationInfo: vi.fn(),
    setPlatformEditIconFileId: vi.fn(),
    setSelectedPlatform: vi.fn(),
    setUiConfig: vi.fn(),
  },
});

describe("platformDetails handlers", () => {
  it("sets UI configuration before mount", () => {
    const deps = createDeps();
    handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: deps.uiConfig,
    });
    expect(deps.render).not.toHaveBeenCalled();
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
      applicationIdentifier: "",
      iconFileId: "project-icon-1",
      shortName: "",
      description: "",
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
      message: EN_I18N.platformDetailsPage.windowsIconRequired,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("names macOS when its required application icon is missing", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "create",
      platform: "macos",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue(undefined);

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "macOS Project",
            applicationIdentifier: "com.example.macos-project",
            publisher: "Example Publisher",
            description: "macOS description",
            copyright: "Copyright Example Publisher",
            category: "public.app-category.games",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.macosIconRequired,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.createCurrentPlatformDetails,
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
      applicationIdentifier: "com.example.web-project",
      iconFileId: "web-icon-1",
      shortName: "Project",
      description: "Web description",
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
            applicationIdentifier: " com.example.web-project ",
            shortName: " Project ",
            description: " Web description ",
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

  it("does not create Web platform details without an application identifier", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "create",
      platform: "web",
    });

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Project One",
            applicationIdentifier: "",
            shortName: "",
            description: "",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.webApplicationIdentifierRequired,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("does not create Web platform details with an invalid application identifier", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "create",
      platform: "web",
    });

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Project One",
            applicationIdentifier: "com.yourteam/yourvn",
            shortName: "",
            description: "",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.webApplicationIdentifierInvalid,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.createCurrentPlatformDetails,
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
