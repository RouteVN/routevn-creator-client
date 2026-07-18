import { tap } from "rxjs";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { validatePlatformDetails } from "../../internal/platformDetailsValidation.js";
import { selectPlatformDetailsPageCopy } from "./support/platformDetailsPageCopy.js";

const ICON_VALIDATIONS = [
  {
    type: "image-min-size",
    minWidth: 64,
    minHeight: 64,
  },
];

export const handleBeforeMount = (deps) => {
  const { projectService, render, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });

  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        store.setColorsData({ colorsData: repositoryState?.colors });
        render();
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, i18n, projectService, render, store } = deps;
  const copy = selectPlatformDetailsPageCopy(i18n);

  try {
    const [webPlatformDetails, windowsPlatformDetails, macosPlatformDetails] =
      await Promise.all([
        projectService.getCurrentPlatformDetails("web"),
        projectService.getCurrentPlatformDetails("windows"),
        projectService.getCurrentPlatformDetails("macos"),
      ]);
    const platformDetails = [
      ["web", webPlatformDetails],
      ["windows", windowsPlatformDetails],
      ["macos", macosPlatformDetails],
    ];
    for (const [platform, applicationInfo] of platformDetails) {
      if (applicationInfo) {
        store.setPlatformApplicationInfo({ platform, applicationInfo });
      }
    }
    render();
  } catch {
    appService.showToast({ message: copy.failedLoadMessage });
  }
};

export const handlePlatformTabClick = (deps, payload) => {
  const { render, store } = deps;
  const { id: platform } = payload._event.detail;
  if (platform === store.selectSelectedPlatform()) {
    return;
  }

  store.setSelectedPlatform({ platform });
  render();
};

export const handleAddPlatformButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openAddPlatformMenu({ x: rect.right, y: rect.bottom });
  render();
};

export const handleAddPlatformMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeAddPlatformMenu();
  render();
};

export const handleAddPlatformMenuItemClick = async (deps, payload) => {
  const { appService, i18n, projectService, refs, render, store } = deps;
  const { item } = payload._event.detail;
  const platform = item.value;
  const copy = selectPlatformDetailsPageCopy(i18n);
  store.closeAddPlatformMenu();

  try {
    const applicationInfo =
      await projectService.getCurrentPlatformDetailsDefaults(platform);
    store.openPlatformCreateDialog({ platform, applicationInfo });
    render();

    const { platformEditForm } = refs;
    platformEditForm.reset();
    platformEditForm.setValues({
      values: store.selectPlatformEditDefaultValues(),
    });
  } catch {
    render();
    appService.showAlert({
      message: copy.failedCreatePlatformMessage,
      title: copy.errorTitle,
    });
  }
};

export const handlePlatformEditButtonClick = (deps) => {
  const { refs, render, store } = deps;
  store.openPlatformEditDialog();
  render();

  const { platformEditForm } = refs;
  platformEditForm.reset();
  platformEditForm.setValues({
    values: store.selectPlatformEditDefaultValues(),
  });
};

export const handlePlatformEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closePlatformEditDialog();
  render();
};

const createPlatformDetailsPatch = ({ platform, values, iconFileId }) => {
  const patch = {
    applicationName: values.applicationName.trim(),
    iconFileId,
  };

  if (platform !== "web") {
    patch.applicationIdentifier = values.applicationIdentifier.trim();
  }

  if (platform === "web") {
    patch.shortName = values.shortName.trim();
    patch.description = values.description.trim();
    patch.themeColorId = (values.themeColorId ?? "").trim();
    patch.backgroundColorId = (values.backgroundColorId ?? "").trim();
  }

  if (platform === "windows" || platform === "macos") {
    patch.publisher = values.publisher.trim();
    patch.description = values.description.trim();
    patch.copyright = values.copyright.trim();
  }

  if (platform === "macos") {
    patch.category = values.category.trim();
  }

  return patch;
};

const getValidationMessage = (copy, code) => {
  if (code === "application-name-required") {
    return copy.applicationNameRequired;
  }
  if (code === "native-icon-required") {
    return copy.nativeIconRequired;
  }
  if (code === "theme-color-not-found") {
    return copy.webThemeColorNotFound;
  }
  if (code === "background-color-not-found") {
    return copy.webBackgroundColorNotFound;
  }
  if (code === "windows-identifier-invalid") {
    return copy.windowsApplicationIdentifierInvalid;
  }
  if (code === "macos-identifier-required") {
    return copy.macosApplicationIdentifierRequired;
  }
  if (code === "macos-identifier-invalid") {
    return copy.macosApplicationIdentifierInvalid;
  }
  return copy.macosCategoryInvalid;
};

export const handlePlatformEditFormAction = async (deps, payload = {}) => {
  const { appService, i18n, projectService, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const copy = selectPlatformDetailsPageCopy(i18n);
  const { mode, platform } = store.selectPlatformDialogState();
  const patch = createPlatformDetailsPatch({
    platform,
    values,
    iconFileId: store.selectPlatformEditIconFileId(),
  });
  const validation = validatePlatformDetails({
    platform,
    applicationInfo: patch,
    availableColorIds: platform === "web" ? store.selectColorIds() : undefined,
  });
  if (!validation.valid) {
    appService.showAlert({
      message: getValidationMessage(copy, validation.code),
      title: copy.warningTitle,
    });
    return;
  }

  try {
    const applicationInfo =
      mode === "create"
        ? await projectService.createCurrentPlatformDetails(platform, patch)
        : await projectService.updateCurrentPlatformDetails(platform, patch);
    store.setPlatformApplicationInfo({ platform, applicationInfo });
    if (mode === "create") {
      store.setSelectedPlatform({ platform });
    }
    store.closePlatformEditDialog();
    render();
    appService.showToast({
      message:
        mode === "create"
          ? copy.platformDetailsCreatedMessage
          : copy.platformDetailsSavedMessage,
    });
  } catch {
    appService.showAlert({
      message:
        mode === "create"
          ? copy.failedCreatePlatformMessage
          : copy.failedSavePlatformMessage,
      title: copy.errorTitle,
    });
  }
};

export const handlePlatformEditDialogIconClick = async (deps) => {
  const { appService, i18n, render, store } = deps;
  const copy = selectPlatformDetailsPageCopy(i18n);
  let file;

  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: ICON_VALIDATIONS,
    });
  } catch {
    appService.showAlert({
      message: copy.failedSelectIcon,
      title: copy.errorTitle,
    });
    return;
  }

  if (!file) {
    return;
  }

  store.openPlatformEditIconCropDialog({ file });
  render();
};

export const handlePlatformEditIconCropDialogClose = (deps) => {
  const { render, store } = deps;
  if (!store.selectIsPlatformEditIconCropDialogOpen()) {
    return;
  }

  store.closePlatformEditIconCropDialog();
  render();
};

export const handlePlatformEditIconCropDialogConfirm = async (deps) => {
  const { appService, i18n, projectService, refs, render, store } = deps;
  const copy = selectPlatformDetailsPageCopy(i18n);

  let croppedFile;
  try {
    croppedFile = await refs.platformEditIconCropDialog.getCroppedFile();
    if (!croppedFile) {
      throw new Error(copy.iconCropNotReady);
    }
  } catch {
    appService.showAlert({
      message: copy.failedCropIcon,
      title: copy.errorTitle,
    });
    return;
  }

  let uploadResult;
  try {
    const uploadResults = await projectService.uploadFiles([croppedFile], {
      skipImageThumbnail: true,
    });
    uploadResult = uploadResults?.[0];
  } catch {
    uploadResult = undefined;
  }

  if (!uploadResult?.fileId) {
    appService.showAlert({
      message: copy.failedUploadIcon,
      title: copy.errorTitle,
    });
    return;
  }

  store.setPlatformEditIconFileId({ iconFileId: uploadResult.fileId });
  store.closePlatformEditIconCropDialog();
  render();
};
