import { validatePlatformDetails } from "../../internal/platformDetailsValidation.js";
import {
  createPlatformDetailsPatch,
  getPlatformDetailsValidationMessage,
  PLATFORM_APPLICATION_ICON_VALIDATIONS,
} from "../../internal/ui/platformDetailsForm.js";

const propsChanged = (oldProps = {}, newProps = {}) =>
  oldProps.platform !== newProps.platform ||
  oldProps.applicationInfo !== newProps.applicationInfo;

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.syncFromProps({ props });
};

export const handleOnUpdate = (deps, payload = {}) => {
  const { store, render } = deps;
  const { oldProps, newProps } = payload;
  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  store.syncFromProps({ props: newProps });
  render();
};

export const handleFormAction = async (deps, payload) => {
  const { appService, dispatchEvent, i18n, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const copy = i18n.platformDetailsPage;
  const platform = store.selectPlatform();
  const patch = createPlatformDetailsPatch({
    platform,
    values,
    iconFileId: store.selectIconFileId(),
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

  let applicationInfo;
  try {
    applicationInfo = await projectService.createCurrentPlatformDetails(
      platform,
      patch,
    );
  } catch {
    appService.showAlert({
      message: copy.failedCreatePlatformMessage,
      title: copy.errorTitle,
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("created", {
      detail: { platform, applicationInfo },
    }),
  );
};

export const handleIconClick = async (deps) => {
  const { appService, i18n, render, store } = deps;
  const copy = i18n.platformDetailsPage;
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

  store.openIconCropDialog({ file });
  render();
};

export const handleIconCropDialogClose = (deps) => {
  const { render, store } = deps;
  if (!store.selectIsIconCropDialogOpen()) {
    return;
  }

  store.closeIconCropDialog();
  render();
};

export const handleIconCropDialogConfirm = async (deps) => {
  const { appService, i18n, projectService, refs, render, store } = deps;
  const copy = i18n.platformDetailsPage;

  let croppedFile;
  try {
    croppedFile = await refs.iconCropDialog.getCroppedFile();
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

  store.setIconFileId({ iconFileId: uploadResult.fileId });
  store.closeIconCropDialog();
  render();
};
