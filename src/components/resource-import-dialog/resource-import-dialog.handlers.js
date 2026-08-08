import { generateId } from "../../internal/id.js";

const SOURCE_STEP = "source";
const SELECTION_STEP = "selection";
const ITEM_STEP = "item";

const mapErrorMessage = (error, i18n = {}) => {
  const copy = i18n.resourceImport ?? {};
  const messages = i18n.resourceImportErrors ?? {};
  return {
    ...error,
    message: messages[error?.code] ?? error?.message ?? copy.failed,
  };
};

const syncFromProps = (deps, props, { reset = false } = {}) => {
  const { projectService, store } = deps;
  store.syncFromProps({
    props,
    repositoryState: projectService.getRepositoryState(),
    reset,
  });
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
  if (
    oldProps.open === newProps.open &&
    oldProps.expectedResourceType === newProps.expectedResourceType &&
    oldProps.targetParentId === newProps.targetParentId &&
    oldProps.projectResolution === newProps.projectResolution
  ) {
    return;
  }
  syncFromProps(deps, newProps);
  deps.render();
};

const emitCancelled = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("import-cancelled"));
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
  plan.resources.forEach((resource, index) => {
    if (values[`resource_${index}_include`] === true) {
      selectedResourceIds.push(resource.sourceId);
      resourceNames[resource.sourceId] = values[`resource_${index}_name`];
    }
  });
  const resourceChoices = {};
  plan.images.forEach((image, index) => {
    const mode = values[`image_${index}_mode`];
    resourceChoices[image.sourceId] = { mode };
    if (mode === "existing") {
      resourceChoices[image.sourceId].projectResourceId =
        values[`image_${index}_existingId`];
    }
  });
  return { selectedResourceIds, resourceNames, resourceChoices };
};

const importsSelectedPackageImages = ({ plan, choices }) => {
  const selectedIds = new Set(choices.selectedResourceIds);
  return plan.images.some(
    (image) =>
      choices.resourceChoices[image.sourceId]?.mode === "import" &&
      (image.usedByResourceIds ?? []).some((sourceId) =>
        selectedIds.has(sourceId),
      ),
  );
};

const buildDestinationChoice = ({ mode, parentId, folderName }) => {
  if (mode === "new") {
    return { mode: "create", name: folderName };
  }
  return { mode: "existing", parentId };
};

const mergeReviewValues = (store, values) => {
  const mergedValues = {};
  Object.assign(mergedValues, store.selectReviewValues(), values);
  return mergedValues;
};

const getSelectedResourceIndexes = ({ plan, values }) =>
  plan.resources
    .map((_resource, index) => index)
    .filter((index) => values[`resource_${index}_include`] === true);

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
    expectedResourceType: deps.props.expectedResourceType,
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
  const importsPackageImages = importsSelectedPackageImages({ plan, choices });
  const resourceDestination = buildDestinationChoice({
    mode: values.resourceDestinationMode,
    parentId: values.resourceParentId,
    folderName: values.resourceNewFolderName,
  });
  const imageDestination = importsPackageImages
    ? buildDestinationChoice({
        mode: values.imageDestinationMode,
        parentId: values.imageParentId,
        folderName: values.imageNewFolderName,
      })
    : undefined;
  const validation = projectService.validateResourceImportPlan({
    planId: plan.planId,
    ...choices,
    resourceDestination,
    imageDestination,
  });
  if (validation.valid === false) {
    store.setError({
      error: mapErrorMessage(validation.error, deps.i18n),
      step: ITEM_STEP,
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
    resourceDestination,
    imageDestination,
    onProgress(progress) {
      store.setProgress({ progress });
      render();
    },
  });
  if (result.valid === false) {
    store.setError({
      error: mapErrorMessage(result.error, deps.i18n),
      step: ITEM_STEP,
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
      return;
    }
    const plan = store.selectPlan();
    const mergedValues = mergeReviewValues(store, values);
    const selectedResourceIndexes = getSelectedResourceIndexes({
      plan,
      values: mergedValues,
    });
    const currentPosition = selectedResourceIndexes.indexOf(
      store.selectCurrentResourceIndex(),
    );
    if (currentPosition > 0) {
      store.openItemStep({
        values,
        resourceIndex: selectedResourceIndexes[currentPosition - 1],
      });
    } else if (plan.resources.length > 1) {
      store.openSelectionStep({ values });
    } else {
      store.openSourceStep({ values });
    }
    render();
    return;
  }
  if (valid === false) return;
  const step = store.selectStep();
  if (actionId === "continue" && step === SOURCE_STEP) {
    await handleSourceSubmit(deps, values);
    return;
  }
  if (actionId === "select-continue" && step === SELECTION_STEP) {
    const plan = store.selectPlan();
    const mergedValues = mergeReviewValues(store, values);
    const selectedResourceIndexes = getSelectedResourceIndexes({
      plan,
      values: mergedValues,
    });
    if (selectedResourceIndexes.length === 0) {
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
    store.openItemStep({
      values,
      resourceIndex: selectedResourceIndexes[0],
    });
    render();
    return;
  }
  if (actionId === "next" && step === ITEM_STEP) {
    const plan = store.selectPlan();
    const mergedValues = mergeReviewValues(store, values);
    const selectedResourceIndexes = getSelectedResourceIndexes({
      plan,
      values: mergedValues,
    });
    const currentPosition = selectedResourceIndexes.indexOf(
      store.selectCurrentResourceIndex(),
    );
    store.openItemStep({
      values,
      resourceIndex: selectedResourceIndexes[currentPosition + 1],
    });
    render();
    return;
  }
  if (actionId === "import" && step === ITEM_STEP) {
    await handleReviewSubmit(deps, mergeReviewValues(store, values));
  }
};

export const handleResourceSelectionChange = (deps, payload) => {
  const { store, render } = deps;
  const resourceIndex = Number(
    payload._event.currentTarget.dataset.resourceIndex,
  );
  const { value } = payload._event.detail;
  store.setResourceSelected({ resourceIndex, selected: value });
  render();
};

const getImageIndex = (payload) =>
  Number(payload._event.currentTarget.dataset.imageIndex);

export const handleImageCustomize = (deps, payload) => {
  const { store, render } = deps;
  store.openImageSelector({ imageIndex: getImageIndex(payload) });
  render();
};

export const handleImageUseDefault = (deps, payload) => {
  const { store, render } = deps;
  store.useDefaultImage({ imageIndex: getImageIndex(payload) });
  render();
};

export const handleImageSelectorClose = (deps) => {
  const { store, render } = deps;
  store.closeImageSelector();
  render();
};

export const handleReplacementImageSelected = (deps, payload) => {
  const { store } = deps;
  const { imageId } = payload._event.detail;
  store.setSelectedReplacementImage({ imageId });
};

export const handleConfirmImageReplacement = (deps) => {
  const { store, render } = deps;
  store.confirmImageReplacement();
  render();
};

export const handleCancelProgress = (deps) => {
  const operationId = deps.store.selectOperationId();
  if (operationId) {
    deps.projectService.cancelResourceImport({ operationId });
  }
};
