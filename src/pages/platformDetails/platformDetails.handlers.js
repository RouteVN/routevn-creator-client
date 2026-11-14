import { validatePlatformDetails } from "../../internal/platformDetailsValidation.js";
import {
  createPlatformDetailsPatch,
  getPlatformDetailsValidationMessage,
  PLATFORM_APPLICATION_ICON_VALIDATIONS,
} from "../../internal/ui/platformDetailsForm.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  getAndroidSigningKeyErrorMessage,
  saveAndroidSigningKeyCopy,
  uploadAndroidSigningKey,
} from "./support/androidSigningKeys.js";
import { selectPlatformDetailsPageCopy } from "./support/platformDetailsPageCopy.js";

export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  store.setPlatform({ platform: appService.getPlatform() });
  return mountMobileResourceWindowLayout(deps);
};

export const handleAfterMount = async (deps) => {
  const { appService, i18n, projectService, render, store } = deps;
  const copy = selectPlatformDetailsPageCopy(i18n);

  try {
    const [
      webPlatformDetails,
      windowsPlatformDetails,
      macosPlatformDetails,
      androidPlatformDetails,
    ] = await Promise.all([
      projectService.getCurrentPlatformDetails("web"),
      projectService.getCurrentPlatformDetails("windows"),
      projectService.getCurrentPlatformDetails("macos"),
      projectService.getCurrentPlatformDetails("android"),
    ]);
    const platformDetails = [
      ["web", webPlatformDetails],
      ["windows", windowsPlatformDetails],
      ["macos", macosPlatformDetails],
      ["android", androidPlatformDetails],
    ];
    for (const [platform, applicationInfo] of platformDetails) {
      if (applicationInfo) {
        store.setPlatformApplicationInfo({ platform, applicationInfo });
      }
    }
    await loadAndroidSigning(deps);
    render();
  } catch {
    appService.showToast({ message: copy.failedLoadMessage });
  }
};

// The project's signing keys, for hosts that sign Android builds.
const loadAndroidSigning = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  if (!projectService.supportsAndroidSigning()) {
    store.setAndroidSigning({ supported: false });
    return;
  }
  try {
    const { currentKey, previousKeys } =
      await projectService.getAndroidSigningSummary();
    store.setAndroidSigning({ supported: true, currentKey, previousKeys });
  } catch {
    const copy = selectPlatformDetailsPageCopy(i18n);
    appService.showToast({ message: copy.androidSigningLoadFailed });
  }
};

// Runs a key change with the key buttons disabled, then shows the keys as
// the project now has them.
const runAndroidSigningChange = async (deps, task) => {
  const { render, store } = deps;
  store.setAndroidSigningBusy({ busy: true });
  render();
  try {
    return await task();
  } finally {
    await loadAndroidSigning(deps);
    store.setAndroidSigningBusy({ busy: false });
    render();
  }
};

const createAndroidSigningKey = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  const copy = selectPlatformDetailsPageCopy(i18n);
  const { applicationName, applicationIdentifier } =
    store.selectAndroidApplicationInfo();
  try {
    await runAndroidSigningChange(deps, () =>
      projectService.createAndroidSigningKey({
        applicationName,
        applicationId: applicationIdentifier,
      }),
    );
    appService.showToast({ message: copy.androidKeyCreatedMessage });
  } catch (error) {
    appService.showAlert({
      message: getAndroidSigningKeyErrorMessage(error, copy),
      title: copy.errorTitle,
    });
  }
};

export const handleAndroidCreateKeyClick = (deps) => {
  const { store } = deps;
  if (store.selectAndroidSigning().busy) return;
  return createAndroidSigningKey(deps);
};

export const handleAndroidReplaceKeyClick = async (deps) => {
  const { appService, i18n, store } = deps;
  if (store.selectAndroidSigning().busy) return;
  const copy = selectPlatformDetailsPageCopy(i18n);
  const confirmed = await appService.showDialog({
    title: copy.androidReplaceKeyTitle,
    message: copy.androidReplaceKeyMessage,
    confirmText: copy.androidReplaceKeyConfirm,
    cancelText: copy.cancelButton,
  });
  if (!confirmed) return;
  await createAndroidSigningKey(deps);
};

export const handleAndroidUploadKeyClick = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  const signing = store.selectAndroidSigning();
  if (signing.busy) return;
  await uploadAndroidSigningKey({
    appService,
    projectService,
    copy: selectPlatformDetailsPageCopy(i18n),
    replacesKey: signing.currentKey !== undefined,
    onImport: (task) => runAndroidSigningChange(deps, task),
  });
};

export const handleAndroidUseKeyAgainClick = async (deps, payload) => {
  const { appService, i18n, projectService, store } = deps;
  if (store.selectAndroidSigning().busy) return;
  const { certificateSha256 } = payload._event.currentTarget.dataset;
  const copy = selectPlatformDetailsPageCopy(i18n);
  const confirmed = await appService.showDialog({
    title: copy.androidUseKeyAgainTitle,
    message: copy.androidUseKeyAgainMessage,
    confirmText: copy.androidUseKeyAgainConfirm,
    cancelText: copy.cancelButton,
  });
  if (!confirmed) return;
  try {
    await runAndroidSigningChange(deps, () =>
      projectService.useAndroidSigningKeyAgain(certificateSha256),
    );
    appService.showToast({ message: copy.androidKeyInUseMessage });
  } catch (error) {
    appService.showAlert({
      message: getAndroidSigningKeyErrorMessage(error, copy),
      title: copy.errorTitle,
    });
  }
};

export const handleAndroidSaveKeyCopyClick = async (deps, payload) => {
  const { appService, i18n, projectService, store } = deps;
  if (store.selectAndroidSigning().busy) return;
  const { certificateSha256 } = payload._event.currentTarget.dataset;
  await saveAndroidSigningKeyCopy({
    appService,
    projectService,
    copy: selectPlatformDetailsPageCopy(i18n),
    certificateSha256,
    applicationName: store.selectAndroidApplicationInfo().applicationName,
    onSave: (task) => runAndroidSigningChange(deps, task),
  });
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
  store.openAddPlatformMenu({ x: rect.left, y: rect.bottom });
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

  if (!store.selectCanAddPlatform({ platform })) {
    render();
    return;
  }

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

export const handlePlatformEditFormAction = async (deps, payload = {}) => {
  const { appService, i18n, projectService, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const copy = selectPlatformDetailsPageCopy(i18n);
  const { mode, platform } = store.selectPlatformDialogState();
  if (mode === "create" && !store.selectCanAddPlatform({ platform })) {
    appService.showAlert({
      message: copy.failedCreatePlatformMessage,
      title: copy.errorTitle,
    });
    return;
  }
  const patch = createPlatformDetailsPatch({
    platform,
    values,
    iconFileId: store.selectPlatformEditIconFileId(),
    adaptiveIconFileId: store.selectPlatformEditAdaptiveIconFileId(),
    splashIconFileId: store.selectPlatformEditSplashIconFileId(),
    loadingBackgroundFileId: store.selectPlatformEditLoadingBackgroundFileId(),
    startBackgroundFileId: store.selectPlatformEditStartBackgroundFileId(),
  });
  const validation = validatePlatformDetails({
    platform,
    applicationInfo: patch,
  });
  if (!validation.valid) {
    appService.showAlert({
      message: getPlatformDetailsValidationMessage(copy, validation.code),
      title: copy.warningTitle,
    });
    return;
  }

  if (mode === "edit" && platform === "web") {
    const originalApplicationIdentifier =
      store.selectPlatformEditDefaultValues().applicationIdentifier ?? "";
    if (patch.applicationIdentifier !== originalApplicationIdentifier) {
      const confirmed = await appService.showDialog({
        title: copy.webApplicationIdentifierChangeTitle,
        message: copy.webApplicationIdentifierChangeMessage,
        confirmText: copy.webApplicationIdentifierChangeConfirm,
        cancelText: copy.cancelButton,
      });
      if (!confirmed) {
        return;
      }
    }
  }

  // Installed copies of a signed game only update to builds with the same
  // application ID.
  if (
    mode === "edit" &&
    platform === "android" &&
    store.selectAndroidSigning().currentKey &&
    patch.applicationIdentifier !==
      store.selectPlatformEditDefaultValues().applicationIdentifier
  ) {
    const confirmed = await appService.showDialog({
      title: copy.androidApplicationIdentifierChangeTitle,
      message: copy.androidApplicationIdentifierChangeMessage,
      confirmText: copy.androidApplicationIdentifierChangeConfirm,
      cancelText: copy.cancelButton,
    });
    if (!confirmed) {
      return;
    }
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

export const handlePlatformEditDialogIconClick = async (
  deps,
  { target = "icon" } = {},
) => {
  const { appService, i18n, render, store } = deps;
  const copy = selectPlatformDetailsPageCopy(i18n);
  let file;

  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: PLATFORM_APPLICATION_ICON_VALIDATIONS,
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

  store.openPlatformEditIconCropDialog({ file, target });
  render();
};

// Screen backgrounds keep the picked image as is: the export fits the whole
// image on screen, so there is nothing to crop.
export const handlePlatformEditScreenBackgroundClick = async (
  deps,
  payload,
) => {
  const { appService, i18n, projectService, render, store } = deps;
  const { target } = payload;
  const copy = selectPlatformDetailsPageCopy(i18n);
  let file;

  try {
    file = await appService.pickFiles({
      accept: "image/png,image/jpeg,image/webp",
      multiple: false,
    });
  } catch {
    appService.showAlert({
      message: copy.failedSelectBackground,
      title: copy.errorTitle,
    });
    return;
  }

  if (!file) {
    return;
  }

  let uploadResult;
  try {
    const uploadResults = await projectService.uploadFiles([file], {
      skipImageThumbnail: true,
    });
    uploadResult = uploadResults?.[0];
  } catch {
    uploadResult = undefined;
  }

  if (!uploadResult?.fileId) {
    appService.showAlert({
      message: copy.failedUploadBackground,
      title: copy.errorTitle,
    });
    return;
  }

  store.setPlatformEditScreenBackgroundFileId({
    target,
    fileId: uploadResult.fileId,
  });
  render();
};

export const handleRemovePlatformEditScreenBackground = (deps, payload) => {
  const { store, render } = deps;
  const { target } = payload;
  store.setPlatformEditScreenBackgroundFileId({ target, fileId: undefined });
  render();
};

export const handleRemovePlatformEditOptionalIcon = (deps, payload) => {
  const { store, render } = deps;
  const { target } = payload;
  store.setPlatformEditOptionalIconFileId({ target, fileId: undefined });
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

  const target = store.selectPlatformEditIconCropTarget();
  if (target === "icon")
    store.setPlatformEditIconFileId({ iconFileId: uploadResult.fileId });
  else
    store.setPlatformEditOptionalIconFileId({
      target,
      fileId: uploadResult.fileId,
    });
  store.closePlatformEditIconCropDialog();
  render();
};

export const handlePlatformEditFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, value } = payload._event.detail;
  if (name !== "iconBackgroundColor" && name !== "splashBackgroundColor")
    return;
  store.setPlatformEditBackgroundColor({ name, value });
  render();
};
