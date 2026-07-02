import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

const getInputLayoutsFromRepository = (repositoryState = {}) =>
  Object.entries(repositoryState.layouts?.items ?? {})
    .filter(([, layout]) => layout?.layoutType === "input")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
      elements: layout.elements,
    }));

const getLayouts = ({ props, repositoryState } = {}) => {
  if (Array.isArray(props?.layouts) && props.layouts.length > 0) {
    return props.layouts;
  }

  return getInputLayoutsFromRepository(repositoryState);
};

const getLayoutsData = ({ props, repositoryState } = {}) =>
  props?.layoutsData ?? repositoryState?.layouts ?? EMPTY_COLLECTION;

const getEventValue = (payload = {}) =>
  payload._event?.detail?.value ??
  payload._event?.target?.value ??
  payload._event?.currentTarget?.value;

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const form = store.selectFormDataWithEditingDraft();
  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: form ? { form } : {},
      },
    }),
  );
};

export const handleBeforeMount = (deps) => {
  const { props, store } = deps;

  store.hydrateForm({
    form: props?.form,
    layouts: getLayouts({ props }),
    layoutsData: getLayoutsData({ props }),
  });
};

export const handleAfterMount = async (deps) => {
  const { projectService, props, render, store } = deps;

  await projectService.ensureRepository();
  const repositoryState = projectService.getRepositoryState();
  store.setRepositoryData({
    variables: repositoryState.variables,
  });
  store.hydrateForm({
    form: props?.form,
    layouts: getLayouts({ props, repositoryState }),
    layoutsData: getLayoutsData({ props, repositoryState }),
  });
  render();
};

export const handleFormChange = (deps, payload) => {
  const { props, render, store } = deps;
  const { name, value } = payload._event.detail;

  if (name !== "resourceId") {
    return;
  }

  store.setSelectedResourceId({
    resourceId: value,
    layouts: getLayouts({ props }),
    layoutsData: getLayoutsData({ props }),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleFieldConfigChange = (deps, payload) => {
  const { render, store } = deps;
  const currentTarget = payload._event.currentTarget;
  const field = currentTarget.dataset?.field;
  const name = currentTarget.dataset?.name;

  if (!field || !name) {
    return;
  }

  store.updateFieldConfig({
    field,
    name,
    value: getEventValue(payload),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleFieldRowClick = (deps, payload) => {
  const { render, store } = deps;
  const field = payload._event.currentTarget.dataset?.field;

  if (!field) {
    return;
  }

  store.startEditingField({ field });
  render();
};

export const handleFieldEditChange = (deps, payload) => {
  const { render, store } = deps;
  const name = payload._event.currentTarget.dataset?.name;

  if (!name) {
    return;
  }

  store.updateEditFieldConfig({
    name,
    value: getEventValue(payload),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleCancelFieldEditClick = (deps, payload = {}) => {
  payload._event?.stopPropagation?.();
  const { render, store } = deps;

  store.cancelEditingField();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSaveFieldEditClick = (deps, payload = {}) => {
  payload._event?.stopPropagation?.();
  const { appService, i18n, render, store } = deps;
  const copy = selectCommandLineCopy(i18n);

  if (!store.selectCanSaveEditField()) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Choose a string variable for this input field.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  store.saveEditingField();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSubmitClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { appService, dispatchEvent, i18n, store } = deps;
  const copy = selectCommandLineCopy(i18n);
  const resourceId = store.selectSelectedResourceId();
  const fieldRows = store.selectFieldRows();

  if (!resourceId) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Please select an input layout.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  if (fieldRows.length === 0) {
    appService.showAlert({
      message: localizeCommandLineText(
        "The selected input layout does not contain input fields.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  if (fieldRows.some((row) => !row.variableId)) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Map every input field to a string variable.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        form: store.selectFormData(),
      },
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, render, store } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "input") {
    store.cancelEditingField();
    render();
    dispatchTemporaryPresentationStateChange(deps);
  }
};
