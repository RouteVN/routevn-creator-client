import { generateId } from "../../internal/id.js";

const SOURCE_STEP = "source";
const SELECTION_STEP = "selection";

const mapErrorMessage = (error, i18n = {}) => {
  const copy = i18n.resourceImport ?? {};
  const messages = i18n.resourceImportErrors ?? {};
  return {
    ...error,
    message: messages[error?.code] ?? error?.message ?? copy.failed,
  };
};

const syncFromProps = (deps, props, { reset = false } = {}) => {
  deps.store.syncFromProps({ props, reset });
};

export const handleBeforeMount = (deps) => {
  syncFromProps(deps, deps.props);
  return () => {
    const operationId = deps.store.selectOperationId();
    if (operationId) {
      deps.projectService.cancelResourceImport({ operationId });
    }
  };
};

export const handleOnUpdate = (deps, payload = {}) => {
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};
  if (oldProps.open === newProps.open) return;
  syncFromProps(deps, newProps);
  deps.render();
};

const emitCancelled = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("import-cancelled"));
};

export const handleAssetStoreLink = (deps, payload) => {
  const { appService } = deps;
  const { _event } = payload;
  _event.preventDefault();
  appService.openUrl(_event.currentTarget.getAttribute("href"));
};

export const handleDialogClose = (deps) => {
  const { projectService, store } = deps;
  const operationId = store.selectOperationId();
  if (operationId) projectService.cancelResourceImport({ operationId });
  emitCancelled(deps);
};

const buildReviewPayload = ({ plan, values }) => {
  const selectedResourceIds = [];
  const resourceNames = {};
  const resourceDescriptions = {};
  plan.resources.forEach((resource, index) => {
    if (values[`resource_${index}_include`] === true) {
      selectedResourceIds.push(resource.sourceId);
      resourceNames[resource.sourceId] = values[`resource_${index}_name`];
      resourceDescriptions[resource.sourceId] =
        values[`resource_${index}_description`];
    }
  });
  return {
    selectedResourceIds,
    resourceNames,
    resourceDescriptions,
  };
};

const mergeReviewValues = (store, values) => {
  const mergedValues = {};
  Object.assign(mergedValues, store.selectReviewValues(), values);
  return mergedValues;
};

const handleSourceSubmit = async (deps, values) => {
  const { projectService, store, render } = deps;
  const previousSourceUrl = store.selectSourceValues()?.url?.trim();
  const nextSourceUrl = values.url?.trim();
  if (store.selectPlan() && previousSourceUrl === nextSourceUrl) {
    store.reopenLoadedPlan();
    render();
    return;
  }

  const operationId = generateId();
  store.setLoading({ loading: true, operationId, sourceValues: values });
  render();
  const result = await projectService.createResourceImportPlan({
    url: nextSourceUrl,
    operationId,
  });
  if (result.valid === false) {
    store.setError({ error: mapErrorMessage(result.error, deps.i18n) });
    render();
    return;
  }
  store.setPlan({ plan: result.plan });
  render();
};

const handleReviewSubmit = async (deps, values) => {
  const { dispatchEvent, projectService, store, render } = deps;
  store.saveReviewValues({ values });
  const plan = store.selectPlan();
  const choices = buildReviewPayload({ plan, values });
  const validation = projectService.validateResourceImportPlan({
    planId: plan.planId,
    ...choices,
  });
  if (validation.valid === false) {
    store.setError({
      error: mapErrorMessage(validation.error, deps.i18n),
      step: SELECTION_STEP,
    });
    render();
    return;
  }

  const operationId = generateId();
  store.startExecution({ values, operationId });
  render();
  const result = await projectService.executeResourceImportPlan({
    planId: plan.planId,
    operationId,
    ...choices,
    onProgress(progress) {
      store.setProgress({ progress });
      render();
    },
  });
  if (result.valid === false) {
    store.setError({
      error: mapErrorMessage(result.error, deps.i18n),
      step: SELECTION_STEP,
    });
    render();
    return;
  }
  dispatchEvent(
    new CustomEvent("import-complete", {
      detail: result,
    }),
  );
};

export const handleFormAction = async (deps, payload) => {
  const { store, render } = deps;
  const { actionId, values, valid } = payload._event.detail;
  if (actionId === "back") {
    const step = store.selectStep();
    if (step === SELECTION_STEP) {
      store.openSourceStep({ values });
      render();
    }
    return;
  }
  if (valid === false) return;
  const step = store.selectStep();
  if (actionId === "continue" && step === SOURCE_STEP) {
    await handleSourceSubmit(deps, values);
    return;
  }
  if (actionId === "import" && step === SELECTION_STEP) {
    const mergedValues = mergeReviewValues(store, values);
    const hasSelectedResource = store
      .selectPlan()
      .resources.some(
        (_resource, index) =>
          mergedValues[`resource_${index}_include`] === true,
      );
    if (!hasSelectedResource) {
      store.saveReviewValues({ values });
      store.setError({
        error: mapErrorMessage(
          {
            code: "no_resources_selected",
            message: "Choose at least one resource to import.",
          },
          deps.i18n,
        ),
        step: SELECTION_STEP,
      });
      render();
      return;
    }
    await handleReviewSubmit(deps, mergedValues);
  }
};

const toggleResourceSelection = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget } = payload._event;
  if (currentTarget.dataset.selectionLocked === "true") return;
  const resourceIndex = Number(currentTarget.dataset.resourceIndex);
  const selected = currentTarget.getAttribute("aria-pressed") !== "true";
  store.setResourceSelected({ resourceIndex, selected });
  render();
};

export const handleResourceSelectionToggle = (deps, payload) => {
  toggleResourceSelection(deps, payload);
};

export const handleResourceSelectionKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  _event.preventDefault();
  toggleResourceSelection(deps, payload);
};

export const handleSelectionToggleAll = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget } = payload._event;
  const selected = currentTarget.dataset.allSelected !== "true";
  store.setAllResourcesSelected({ selected });
  render();
};

export const handleCancelProgress = (deps) => {
  const operationId = deps.store.selectOperationId();
  if (operationId) {
    deps.projectService.cancelResourceImport({ operationId });
  }
};
