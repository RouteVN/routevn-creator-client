import {
  createProjectResolutionFormValues,
  CUSTOM_PROJECT_RESOLUTION_PRESET,
} from "../../internal/projectResolution.js";

const ICON_VALIDATIONS = [
  {
    type: "image-min-size",
    minWidth: 512,
    minHeight: 512,
  },
];

const propsChanged = (oldProps = {}, newProps = {}) => {
  return (
    oldProps.platform !== newProps.platform ||
    oldProps.defaultValues !== newProps.defaultValues
  );
};

const selectCopy = (i18n = {}) => {
  if (!i18n.projectsPage) {
    throw new Error("projectsPage i18n catalog is required.");
  }

  return i18n.projectsPage;
};

const revokeIconPreviewUrl = ({ store } = {}) => {
  const previewUrl = store.selectIconPreviewUrl();
  if (!previewUrl) {
    return;
  }

  URL.revokeObjectURL(previewUrl);
};

const syncFromProps = ({ store, props } = {}) => {
  store.syncFromProps({
    props,
  });
};

const refreshProjectLocation = async (deps) => {
  const { appService, store, render } = deps;
  if (store.selectPlatform() !== "ios") return;
  store.beginLocationPreview();
  const requestId = store.selectLocationRequestId();
  const { name } = store.selectDefaultValues();
  render();
  try {
    const location = await appService.previewNewProjectLocation({ name });
    if (store.selectLocationRequestId() !== requestId) return;
    store.setLocationPreview({ location });
  } catch {
    if (store.selectLocationRequestId() !== requestId) return;
    store.setLocationPreview({ failed: true });
  }
  render();
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  syncFromProps({ store, props });
  void refreshProjectLocation(deps);

  return () => {
    store.beginLocationPreview();
    revokeIconPreviewUrl({ store });
    store.clearIconFile();
    store.closeIconCropDialog();
  };
};

export const handleOnUpdate = (deps, payload = {}) => {
  const { store, render } = deps;
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  revokeIconPreviewUrl({ store });
  syncFromProps({ store, props: newProps });
  void refreshProjectLocation(deps);
  render();
};

export const handleBrowseButtonClick = async (deps) => {
  const { appService, i18n, store, render } = deps;
  const copy = selectCopy(i18n);

  if (store.selectPlatform() === "web") {
    return;
  }

  try {
    const selectedPath = await appService.openFolderPicker({
      title: copy.selectProjectLocationTitle,
    });

    if (!selectedPath) {
      return;
    }

    store.setProjectPath({
      path: selectedPath,
    });
    render();
  } catch {
    appService.showAlert({ message: copy.failedSelectProjectLocation });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const previousValues = store.selectDefaultValues();
  const nextValues = {};
  Object.assign(nextValues, payload?._event?.detail?.values);
  const nameChanged = nextValues.name !== previousValues.name;
  let shouldRemount = false;

  if (
    nextValues.resolution &&
    nextValues.resolution !== previousValues.resolution
  ) {
    shouldRemount = true;
    if (nextValues.resolution !== CUSTOM_PROJECT_RESOLUTION_PRESET) {
      Object.assign(
        nextValues,
        createProjectResolutionFormValues(nextValues.resolution),
      );
    }
  }

  store.updateFormValues({
    values: nextValues,
    shouldRemount,
  });
  render();
  if (nameChanged) return refreshProjectLocation(deps);
};

export const handleFormInput = (deps, payload) => {
  const { store } = deps;
  const { name } = payload._event.detail;
  if (store.selectPlatform() === "ios" && name === "name") {
    return handleFormChange(deps, payload);
  }
};

export const handleProjectIconClick = async (deps) => {
  const { appService, i18n, store, render } = deps;
  const copy = selectCopy(i18n);
  let file;

  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: ICON_VALIDATIONS,
    });
  } catch {
    appService.showAlert({ message: copy.failedSelectProjectIcon });
    return;
  }

  if (!file) {
    return;
  }

  store.openIconCropDialog({ file });
  render();
};

export const handleIconCropDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsIconCropDialogOpen()) {
    return;
  }

  store.closeIconCropDialog();
  render();
};

export const handleIconCropDialogConfirm = async (deps) => {
  const { appService, i18n, refs, render, store } = deps;
  const copy = selectCopy(i18n);

  try {
    const croppedFile = await refs.iconCropDialog?.getCroppedFile?.();
    if (!croppedFile) {
      throw new Error(copy.projectIconCropNotReady);
    }

    revokeIconPreviewUrl({ store });
    const previewUrl = URL.createObjectURL(croppedFile);
    store.setIconFile({
      file: croppedFile,
      previewUrl,
    });
    store.closeIconCropDialog();
    render();
  } catch {
    appService.showAlert({ message: copy.failedCropProjectIcon });
  }
};

export const handleValidate = (deps) => {
  const { i18n, refs, render, store } = deps;
  const copy = selectCopy(i18n);
  const formValidation = refs.createProjectForm?.validate?.() ?? {
    valid: false,
    errors: {
      form: copy.createProjectDialogNotReady,
    },
  };
  const errors = {};
  Object.assign(errors, formValidation.errors);
  const customErrors = {};

  if (store.selectPlatform() === "tauri" && !store.selectProjectPath()) {
    customErrors.projectPath = copy.projectLocationRequiredAlert;
    errors.projectPath = customErrors.projectPath;
  }

  if (store.selectPlatform() === "ios" && !store.selectIsLocationReady()) {
    customErrors.projectPath = copy.failedPreviewProjectLocation;
    errors.projectPath = customErrors.projectPath;
  }

  store.setValidationErrors({
    errors: customErrors,
  });
  render();

  return {
    valid:
      formValidation.valid !== false && Object.keys(customErrors).length === 0,
    errors,
  };
};

export const handleGetValues = (deps) => {
  const { refs, store } = deps;
  const values = {
    ...store.selectDefaultValues(),
  };
  Object.assign(values, refs.createProjectForm?.getValues?.());

  values.projectPath = store.selectProjectPath();
  values.iconFile = store.selectIconFile();
  return values;
};

export const handleFormAction = (deps, payload) => {
  const { dispatchEvent } = deps;
  const { actionId } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const validation = handleValidate(deps);
  if (!validation.valid) {
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        values: handleGetValues(deps),
      },
    }),
  );
};
