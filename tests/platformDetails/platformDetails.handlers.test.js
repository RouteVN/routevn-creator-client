import { describe, expect, it, vi } from "vitest";
import {
  handleAddPlatformButtonClick,
  handleAddPlatformMenuItemClick,
  handleAfterMount,
  handleAndroidReplaceKeyClick,
  handleAndroidSaveKeyCopyClick,
  handleAndroidUploadKeyClick,
  handleAndroidUseKeyAgainClick,
  handleBeforeMount,
  handlePlatformEditFormAction,
  handlePlatformEditIconCropDialogConfirm,
  handlePlatformEditScreenBackgroundClick,
  handlePlatformEditScreenBackgroundRightClick,
} from "../../src/pages/platformDetails/platformDetails.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  selectCanAddPlatform,
  setPlatform,
} from "../../src/pages/platformDetails/platformDetails.store.js";

const createDeps = () => ({
  appService: {
    getPlatform: vi.fn(() => "android"),
    pickFiles: vi.fn(),
    showDropdownMenu: vi.fn(),
    showAlert: vi.fn(),
    showDialog: vi.fn(async () => true),
    showToast: vi.fn(),
  },
  i18n: EN_I18N,
  projectService: {
    createCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetailsDefaults: vi.fn(),
    getRepositoryState: vi.fn(() => ({
      project: { resolution: { width: 1920, height: 1080 } },
    })),
    updateCurrentPlatformDetails: vi.fn(),
    uploadFiles: vi.fn(),
    supportsAndroidSigning: vi.fn(() => false),
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
    openAddPlatformMenu: vi.fn(),
    openPlatformCreateDialog: vi.fn(),
    selectCanAddPlatform: vi.fn(() => true),
    selectPlatformDialogState: vi.fn(() => ({
      mode: "edit",
      platform: "windows",
    })),
    selectPlatformEditDefaultValues: vi.fn(() => ({
      applicationName: "Project One",
    })),
    selectPlatformEditIconFileId: vi.fn(() => "windows-icon-1"),
    selectPlatformEditAdaptiveIconFileId: vi.fn(() => undefined),
    selectPlatformEditSplashIconFileId: vi.fn(() => undefined),
    selectPlatformEditLoadingBackgroundFileId: vi.fn(() => undefined),
    selectPlatformEditStartBackgroundFileId: vi.fn(() => undefined),
    setPlatformEditScreenBackgroundFileId: vi.fn(),
    selectPlatformEditScreenBackgroundFileId: vi.fn(() => undefined),
    selectProjectResolution: vi.fn(() => ({ width: 1920, height: 1080 })),
    setProjectResolution: vi.fn(),
    selectPlatformEditIconCropTarget: vi.fn(() => "icon"),
    selectSelectedPlatform: vi.fn(() => "windows"),
    setPlatformApplicationInfo: vi.fn(),
    setPlatform: vi.fn(),
    setPlatformEditIconFileId: vi.fn(),
    setSelectedPlatform: vi.fn(),
    setUiConfig: vi.fn(),
    setAndroidSigning: vi.fn(),
    setAndroidSigningBusy: vi.fn(),
    selectAndroidSigning: vi.fn(() => ({
      supported: false,
      currentKey: undefined,
      busy: false,
    })),
    selectAndroidApplicationInfo: vi.fn(() => ({
      applicationName: "Project One",
      applicationIdentifier: "com.example.project_one",
    })),
  },
  uiConfig: { id: "touch" },
});

describe("platformDetails handlers", () => {
  it.each(["windows", "macos"])(
    "blocks adding %s from iOS menu events and form submissions",
    async (platform) => {
      const deps = createDeps();
      const state = createInitialState();
      setPlatform({ state }, { platform: "ios" });
      deps.store.selectCanAddPlatform.mockImplementation((payload) =>
        selectCanAddPlatform({ state }, payload),
      );
      await handleAddPlatformMenuItemClick(deps, {
        _event: { detail: { item: { value: platform } } },
      });
      expect(
        deps.projectService.getCurrentPlatformDetailsDefaults,
      ).not.toHaveBeenCalled();
      expect(deps.store.openPlatformCreateDialog).not.toHaveBeenCalled();
      deps.store.selectPlatformDialogState.mockReturnValue({
        mode: "create",
        platform,
      });
      await handlePlatformEditFormAction(deps, {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              applicationName: "Project One",
              applicationIdentifier: "com.example.project-one",
            },
          },
        },
      });
      expect(
        deps.projectService.createCurrentPlatformDetails,
      ).not.toHaveBeenCalled();
      expect(
        deps.projectService.updateCurrentPlatformDetails,
      ).not.toHaveBeenCalled();
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: EN_I18N.platformDetailsPage.failedCreatePlatformMessage,
        title: EN_I18N.platformDetailsPage.errorTitle,
      });
    },
  );

  it("opens the add-platform menu below the left edge of its button", () => {
    const deps = createDeps();

    handleAddPlatformButtonClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 120, bottom: 80 }),
        },
      },
    });

    expect(deps.store.openAddPlatformMenu).toHaveBeenCalledWith({
      x: 120,
      y: 80,
    });
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("configures the page before mount", () => {
    const deps = createDeps();

    handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: { id: "touch" },
    });
    expect(deps.store.setPlatform).toHaveBeenCalledWith({
      platform: "android",
    });
  });

  it("keeps the page empty when no platform has been created", async () => {
    const deps = createDeps();
    deps.projectService.getCurrentPlatformDetails.mockResolvedValue(undefined);

    await handleAfterMount(deps);

    expect(deps.projectService.getCurrentPlatformDetails).toHaveBeenCalledTimes(
      4,
    );
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
        };
        return applicationInfo;
      },
    );

    await handleAfterMount(deps);

    expect(deps.projectService.getCurrentPlatformDetails).toHaveBeenCalledTimes(
      4,
    );
    expect(deps.store.setPlatformApplicationInfo).toHaveBeenCalledWith({
      platform: "web",
      applicationInfo: {
        applicationName: "web Project",
      },
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens a prefilled create form from the add menu without persisting", async () => {
    const deps = createDeps();
    const applicationInfo = {
      applicationName: "Project One",
      applicationIdentifier: "",
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

  it("preserves hidden Windows metadata by omitting it from edit patches", async () => {
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
          },
        },
      },
    });

    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("windows", {
      applicationName: "Windows Project",
      iconFileId: "windows-icon-1",
      applicationIdentifier: "com.example.windows-project",
    });
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

  it("requires an application identifier before saving Windows details", async () => {
    const deps = createDeps();

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Windows Project",
            applicationIdentifier: "",
            publisher: "Example Publisher",
            description: "Windows description",
            copyright: "Copyright Example Publisher",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.windowsApplicationIdentifierRequired,
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
    expect(deps.appService.showDialog).not.toHaveBeenCalled();
  });

  it("warns before changing an existing Web application identifier", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "web",
    });
    deps.store.selectPlatformEditDefaultValues.mockReturnValue({
      applicationIdentifier: "com.example.web-project",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("web-icon-1");
    deps.appService.showDialog.mockResolvedValue(false);

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Web Project",
            applicationIdentifier: "com.example.web-project-two",
          },
        },
      },
    });

    expect(deps.appService.showDialog).toHaveBeenCalledWith({
      title: EN_I18N.platformDetailsPage.webApplicationIdentifierChangeTitle,
      message:
        EN_I18N.platformDetailsPage.webApplicationIdentifierChangeMessage,
      confirmText:
        EN_I18N.platformDetailsPage.webApplicationIdentifierChangeConfirm,
      cancelText: EN_I18N.platformDetailsPage.cancelButton,
    });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });

  it("saves a changed Web application identifier after confirmation", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "web",
    });
    deps.store.selectPlatformEditDefaultValues.mockReturnValue({
      applicationIdentifier: "com.example.web-project",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("web-icon-1");
    const applicationInfo = {
      applicationName: "Web Project",
      applicationIdentifier: "com.example.web-project-two",
    };
    deps.projectService.updateCurrentPlatformDetails.mockResolvedValue(
      applicationInfo,
    );

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Web Project",
            applicationIdentifier: "com.example.web-project-two",
          },
        },
      },
    });

    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("web", applicationInfo);
    expect(deps.store.closePlatformEditDialog).toHaveBeenCalledTimes(1);
  });

  it("saves Web edits without warning when the identifier is unchanged", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "web",
    });
    deps.store.selectPlatformEditDefaultValues.mockReturnValue({
      applicationIdentifier: "com.example.web-project",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("web-icon-1");
    const applicationInfo = {
      applicationName: "Updated Web Project",
      applicationIdentifier: "com.example.web-project",
    };
    deps.projectService.updateCurrentPlatformDetails.mockResolvedValue(
      applicationInfo,
    );

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Updated Web Project",
            applicationIdentifier: "com.example.web-project",
          },
        },
      },
    });

    expect(deps.appService.showDialog).not.toHaveBeenCalled();
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("web", applicationInfo);
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

  it("persists only the current macOS platform metadata", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "macos",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("mac-icon-1");
    const applicationInfo = {
      applicationName: "Project One",
      iconFileId: "mac-icon-1",
      applicationIdentifier: "com.example.project-one",
    };
    deps.projectService.updateCurrentPlatformDetails.mockResolvedValue(
      applicationInfo,
    );

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: applicationInfo.applicationName,
            applicationIdentifier: applicationInfo.applicationIdentifier,
          },
        },
      },
    });

    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("macos", applicationInfo);
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

  it("saves the Web screen backgrounds with the platform details", async () => {
    const deps = createDeps();
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "web",
    });
    deps.store.selectPlatformEditDefaultValues.mockReturnValue({
      applicationName: "Web Project",
      applicationIdentifier: "com.example.web-project",
    });
    deps.store.selectPlatformEditLoadingBackgroundFileId.mockReturnValue(
      "loading-background-1",
    );
    deps.store.selectPlatformEditStartBackgroundFileId.mockReturnValue(
      "start-background-1",
    );
    deps.projectService.updateCurrentPlatformDetails.mockResolvedValue({});

    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Web Project",
            applicationIdentifier: "com.example.web-project",
          },
        },
      },
    });

    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("web", {
      applicationName: "Web Project",
      applicationIdentifier: "com.example.web-project",
      loadingBackgroundFileId: "loading-background-1",
      startBackgroundFileId: "start-background-1",
    });
  });

  it("uploads a picked Web screen background into platform edit state", async () => {
    const deps = createDeps();
    const file = { name: "loading.png" };
    deps.appService.pickFiles.mockResolvedValue(file);
    deps.projectService.uploadFiles.mockResolvedValue([
      { fileId: "loading-background-1" },
    ]);

    await handlePlatformEditScreenBackgroundClick(deps, { target: "loading" });

    expect(deps.appService.pickFiles).toHaveBeenCalledWith({
      accept: "image/png,image/jpeg,image/webp",
      multiple: false,
      validations: [{ type: "image-aspect-ratio", width: 1920, height: 1080 }],
    });
    expect(deps.projectService.uploadFiles).toHaveBeenCalledWith([file], {
      skipImageThumbnail: true,
    });
    expect(
      deps.store.setPlatformEditScreenBackgroundFileId,
    ).toHaveBeenCalledWith({
      target: "loading",
      fileId: "loading-background-1",
    });
  });

  it("keeps the Web screen background when the picker is cancelled", async () => {
    const deps = createDeps();
    deps.appService.pickFiles.mockResolvedValue(undefined);

    await handlePlatformEditScreenBackgroundClick(deps, { target: "start" });

    expect(deps.projectService.uploadFiles).not.toHaveBeenCalled();
    expect(
      deps.store.setPlatformEditScreenBackgroundFileId,
    ).not.toHaveBeenCalled();
  });

  it("alerts when a Web screen background cannot be uploaded", async () => {
    const deps = createDeps();
    deps.appService.pickFiles.mockResolvedValue({ name: "start.png" });
    deps.projectService.uploadFiles.mockRejectedValue(new Error("failed"));

    await handlePlatformEditScreenBackgroundClick(deps, { target: "start" });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.failedUploadBackground,
      title: EN_I18N.platformDetailsPage.errorTitle,
    });
    expect(
      deps.store.setPlatformEditScreenBackgroundFileId,
    ).not.toHaveBeenCalled();
  });

  it("removes a Web screen background from its right-click menu", async () => {
    const deps = createDeps();
    const event = {
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    deps.store.selectPlatformEditScreenBackgroundFileId.mockReturnValue(
      "start-background-1",
    );
    deps.appService.showDropdownMenu.mockResolvedValue({
      item: { key: "remove" },
    });

    await handlePlatformEditScreenBackgroundRightClick(deps, {
      _event: event,
      target: "start",
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.appService.showDropdownMenu).toHaveBeenCalledWith({
      items: [{ type: "item", label: "Remove", key: "remove" }],
      x: 10,
      y: 20,
      place: "bs",
    });
    expect(
      deps.store.setPlatformEditScreenBackgroundFileId,
    ).toHaveBeenCalledWith({ target: "start", fileId: undefined });
  });

  it("keeps the Web screen background when its menu is dismissed", async () => {
    const deps = createDeps();
    deps.store.selectPlatformEditScreenBackgroundFileId.mockReturnValue(
      "start-background-1",
    );
    deps.appService.showDropdownMenu.mockResolvedValue(undefined);

    await handlePlatformEditScreenBackgroundRightClick(deps, {
      _event: { preventDefault: vi.fn(), stopPropagation: vi.fn() },
      target: "start",
    });

    expect(
      deps.store.setPlatformEditScreenBackgroundFileId,
    ).not.toHaveBeenCalled();
  });

  it("shows no menu for an empty Web screen background", async () => {
    const deps = createDeps();

    await handlePlatformEditScreenBackgroundRightClick(deps, {
      _event: { preventDefault: vi.fn(), stopPropagation: vi.fn() },
      target: "loading",
    });

    expect(deps.appService.showDropdownMenu).not.toHaveBeenCalled();
  });
});

const KEY_ONE = "1".repeat(64);
const KEY_TWO = "2".repeat(64);
const COPY = EN_I18N.platformDetailsPage;

const createSigningDeps = ({ currentKey } = {}) => {
  const deps = createDeps();
  deps.appService.showFormDialog = vi.fn(async () => undefined);
  deps.appService.getFileDisplayPath = vi.fn((path) => path);
  Object.assign(deps.projectService, {
    supportsAndroidSigning: vi.fn(() => true),
    getAndroidSigningSummary: vi.fn(async () => ({
      currentKey: currentKey
        ? { certificateSha256: currentKey, origin: "created", addedAt: 1 }
        : undefined,
      previousKeys: [],
    })),
    createAndroidSigningKey: vi.fn(async () => ({
      certificateSha256: KEY_TWO,
      changed: true,
    })),
    promptAndroidKeystorePath: vi.fn(async () => "/keys/Project One.p12"),
    importAndroidSigningKey: vi.fn(async () => ({
      certificateSha256: KEY_TWO,
      changed: true,
    })),
    useAndroidSigningKeyAgain: vi.fn(async () => undefined),
    promptAndroidKeyCopyPath: vi.fn(async () => "/keys/copy.p12"),
    saveAndroidSigningKeyCopy: vi.fn(async () => undefined),
  });
  deps.store.selectAndroidSigning.mockReturnValue({
    supported: true,
    currentKey: currentKey
      ? { certificateSha256: currentKey, origin: "created", addedAt: 1 }
      : undefined,
    busy: false,
  });
  return deps;
};

const keyButtonPayload = (certificateSha256) => ({
  _event: { currentTarget: { dataset: { certificateSha256 } } },
});

describe("platformDetails Android signing keys", () => {
  it("loads the project's keys after the platform details", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    await handleAfterMount(deps);
    expect(deps.store.setAndroidSigning).toHaveBeenCalledWith({
      supported: true,
      currentKey: { certificateSha256: KEY_ONE, origin: "created", addedAt: 1 },
      previousKeys: [],
    });
  });

  it("hides the keys on a host that cannot sign", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);
    expect(deps.store.setAndroidSigning).toHaveBeenCalledWith({
      supported: false,
    });
  });

  it("replaces the key only after the creator confirms", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    deps.appService.showDialog.mockResolvedValueOnce(false);
    await handleAndroidReplaceKeyClick(deps);
    expect(deps.appService.showDialog).toHaveBeenCalledWith({
      title: COPY.androidReplaceKeyTitle,
      message: COPY.androidReplaceKeyMessage,
      confirmText: COPY.androidReplaceKeyConfirm,
      cancelText: COPY.cancelButton,
    });
    expect(deps.projectService.createAndroidSigningKey).not.toHaveBeenCalled();

    await handleAndroidReplaceKeyClick(deps);
    expect(deps.projectService.createAndroidSigningKey).toHaveBeenCalledWith({
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    });
    expect(deps.store.setAndroidSigningBusy.mock.calls).toEqual([
      [{ busy: true }],
      [{ busy: false }],
    ]);
    expect(deps.projectService.getAndroidSigningSummary).toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: COPY.androidKeyCreatedMessage,
    });
  });

  it("ignores key buttons while a key change runs", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    deps.store.selectAndroidSigning.mockReturnValue({
      supported: true,
      currentKey: undefined,
      busy: true,
    });
    await handleAndroidReplaceKeyClick(deps);
    await handleAndroidUploadKeyClick(deps);
    expect(deps.appService.showDialog).not.toHaveBeenCalled();
    expect(
      deps.projectService.promptAndroidKeystorePath,
    ).not.toHaveBeenCalled();
  });

  it("uploads a key and asks again after a wrong password", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    deps.appService.showFormDialog
      .mockResolvedValueOnce({
        actionId: "submit",
        values: { password: "wrong one", alias: " upload " },
      })
      .mockResolvedValueOnce({
        actionId: "submit",
        values: { password: "pass one", alias: " upload " },
      });
    deps.projectService.importAndroidSigningKey.mockRejectedValueOnce({
      code: "keystore-password-incorrect",
      message: "The keystore password is incorrect.",
    });
    await handleAndroidUploadKeyClick(deps);

    expect(deps.projectService.promptAndroidKeystorePath).toHaveBeenCalledWith({
      title: COPY.androidKeystorePickerTitle,
      fileTypeName: COPY.androidKeystoreFileTypeName,
    });
    const [firstDialog, secondDialog] =
      deps.appService.showFormDialog.mock.calls.map(([options]) => options);
    expect(firstDialog.form.description).toBe(
      COPY.androidUploadKeyDescription.replace("{fileName}", "Project One.p12"),
    );
    // Uploading over the current key says what that means for updates.
    expect(firstDialog.form.fields[0]).toEqual({
      type: "read-only-text",
      content: COPY.androidUploadKeyReplaceWarning,
    });
    expect(secondDialog.defaultValues).toEqual({
      password: "",
      alias: "upload",
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.androidKeystorePasswordIncorrect,
      title: COPY.errorTitle,
    });
    expect(
      deps.projectService.importAndroidSigningKey,
    ).toHaveBeenLastCalledWith({
      path: "/keys/Project One.p12",
      password: "pass one",
      alias: "upload",
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: COPY.androidKeyUploadedMessage,
    });
  });

  it("stops asking after a keystore Creator cannot read", async () => {
    const deps = createSigningDeps();
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "submit",
      values: { password: "pass one", alias: "" },
    });
    deps.projectService.importAndroidSigningKey.mockRejectedValue({
      code: "keystore-legacy-format",
      message: "legacy",
    });
    await handleAndroidUploadKeyClick(deps);
    expect(deps.appService.showFormDialog).toHaveBeenCalledTimes(1);
    expect(
      deps.appService.showFormDialog.mock.calls[0][0].form.fields[0].name,
    ).toBe("password");
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.androidKeystoreLegacyFormat,
      title: COPY.errorTitle,
    });
  });

  it("does nothing when no keystore is chosen", async () => {
    const deps = createSigningDeps();
    deps.projectService.promptAndroidKeystorePath.mockResolvedValue(undefined);
    await handleAndroidUploadKeyClick(deps);
    expect(deps.appService.showFormDialog).not.toHaveBeenCalled();
    expect(deps.projectService.importAndroidSigningKey).not.toHaveBeenCalled();
  });

  it("uses a previous key again after confirmation", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    await handleAndroidUseKeyAgainClick(deps, keyButtonPayload(KEY_TWO));
    expect(deps.appService.showDialog).toHaveBeenCalledWith({
      title: COPY.androidUseKeyAgainTitle,
      message: COPY.androidUseKeyAgainMessage,
      confirmText: COPY.androidUseKeyAgainConfirm,
      cancelText: COPY.cancelButton,
    });
    expect(deps.projectService.useAndroidSigningKeyAgain).toHaveBeenCalledWith(
      KEY_TWO,
    );
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: COPY.androidKeyInUseMessage,
    });
  });

  it("saves a copy with a confirmed password of six characters or more", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    deps.appService.showFormDialog
      .mockResolvedValueOnce({
        actionId: "submit",
        values: { password: "short", confirmPassword: "short" },
      })
      .mockResolvedValueOnce({
        // Three characters, though six UTF-16 code units.
        actionId: "submit",
        values: { password: "🔑🔑🔑", confirmPassword: "🔑🔑🔑" },
      })
      .mockResolvedValueOnce({
        actionId: "submit",
        values: { password: "pass one", confirmPassword: "pass two" },
      })
      .mockResolvedValueOnce({
        actionId: "submit",
        values: { password: "pass one", confirmPassword: "pass one" },
      });
    await handleAndroidSaveKeyCopyClick(deps, keyButtonPayload(KEY_ONE));
    expect(
      deps.appService.showAlert.mock.calls.map(([alert]) => alert),
    ).toEqual([
      {
        message: COPY.androidKeystorePasswordTooShort.replace("{count}", "6"),
        title: COPY.warningTitle,
      },
      {
        message: COPY.androidKeystorePasswordTooShort.replace("{count}", "6"),
        title: COPY.warningTitle,
      },
      {
        message: COPY.androidKeystorePasswordMismatch,
        title: COPY.warningTitle,
      },
    ]);
    expect(deps.projectService.promptAndroidKeyCopyPath).toHaveBeenCalledWith(
      { defaultFileName: "Project One-signing-key.p12" },
      {
        title: COPY.androidSaveKeyCopyDialogTitle,
        fileTypeName: COPY.androidKeyCopyFileTypeName,
      },
    );
    expect(deps.projectService.saveAndroidSigningKeyCopy).toHaveBeenCalledWith({
      certificateSha256: KEY_ONE,
      path: "/keys/copy.p12",
      password: "pass one",
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: COPY.androidKeyCopySavedMessage.replace(
        "{path}",
        "/keys/copy.p12",
      ),
    });
  });

  it("warns before changing the application ID of a game with a signing key", async () => {
    const deps = createSigningDeps({ currentKey: KEY_ONE });
    deps.store.selectPlatformDialogState.mockReturnValue({
      mode: "edit",
      platform: "android",
    });
    deps.store.selectPlatformEditDefaultValues.mockReturnValue({
      applicationIdentifier: "com.example.project_one",
    });
    deps.store.selectPlatformEditIconFileId.mockReturnValue("android-icon-1");
    deps.appService.showDialog.mockResolvedValue(false);
    await handlePlatformEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            applicationName: "Project One",
            applicationIdentifier: "com.example.project_two",
            iconBackgroundColor: "#FFFFFF",
            splashBackgroundColor: "#000000",
          },
        },
      },
    });
    expect(deps.appService.showDialog).toHaveBeenCalledWith({
      title: COPY.androidApplicationIdentifierChangeTitle,
      message: COPY.androidApplicationIdentifierChangeMessage,
      confirmText: COPY.androidApplicationIdentifierChangeConfirm,
      cancelText: COPY.cancelButton,
    });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });
});
