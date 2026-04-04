import {
  createProjectResolutionFormValues,
  CUSTOM_PROJECT_RESOLUTION_PRESET,
} from "../../internal/projectResolution.js";

const propsChanged = (oldProps = {}, newProps = {}) => {
  return (
    oldProps.platform !== newProps.platform ||
    oldProps.defaultValues !== newProps.defaultValues
  );
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.syncFromProps({
    props,
  });
};

export const handleOnUpdate = (deps, payload = {}) => {
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  deps.store.syncFromProps({
    props: newProps,
  });
  deps.render();
};

export const handleBrowseButtonClick = async (deps) => {
  const { appService, store, render } = deps;

  if (store.selectPlatform() === "web") {
    return;
  }

  try {
    const selectedPath = await appService.openFolderPicker({
      title: "Select Project Location",
    });

    if (!selectedPath) {
      return;
    }

    store.setProjectPath({
      path: selectedPath,
    });
    render();
  } catch {
    appService.showToast("Failed to select project location.");
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const previousValues = store.selectDefaultValues();
  const nextValues = {};
  Object.assign(nextValues, payload?._event?.detail?.values);
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
};

export const handleKeyDown = (deps, payload) => {
  const { refs } = deps;
  const event = payload._event;
  const targetTagName = event.target?.tagName;

  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }

  if (targetTagName === "TEXTAREA" || targetTagName === "RTGL-TEXTAREA") {
    return;
  }

  if (targetTagName === "BUTTON" || targetTagName === "RTGL-BUTTON") {
    event.preventDefault();
    event.target?.click?.();
    return;
  }

  const componentRoot = refs.createProjectForm?.getRootNode?.();
  const dialogBodyHost = componentRoot?.host;
  const shellRoot = dialogBodyHost?.getRootNode?.();
  const submitButton = shellRoot?.querySelector?.("[data-action-id='submit']");

  if (!submitButton) {
    return;
  }

  event.preventDefault();
  submitButton.click();
};

export const handleValidate = (deps) => {
  const { refs, render, store } = deps;
  const formValidation = refs.createProjectForm?.validate?.() ?? {
    valid: false,
    errors: {
      form: "Form is not ready.",
    },
  };
  const errors = {};
  Object.assign(errors, formValidation.errors);
  const customErrors = {};

  if (store.selectPlatform() !== "web" && !store.selectProjectPath()) {
    customErrors.projectPath = "Project location is required.";
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
  return values;
};
