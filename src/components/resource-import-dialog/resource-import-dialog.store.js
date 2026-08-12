import { ROUTEVN_ASSET_STORE_URL } from "../../internal/routevnUrls.js";

const SOURCE_STEP = "source";
const SELECTION_STEP = "selection";
const PROGRESS_STEP = "progress";

const sourceForm = (copy) => ({
  title: copy.title ?? "Import Package",
  fields: [
    {
      type: "slot",
      slot: "source-description",
    },
    {
      name: "url",
      type: "input-text",
      label: copy.urlLabel ?? "Import URL",
      placeholder:
        copy.urlPlaceholder ?? "https://example.com/import/asset-package.json",
      required: {
        message: copy.urlRequired ?? "Import URL is required.",
      },
    },
  ],
  actions: {
    buttons: [
      {
        id: "continue",
        variant: "pr",
        label: copy.continueButton ?? "Review Package",
        validate: true,
      },
    ],
  },
});

const getResourceLabel = (resource, index, copy) =>
  resource.name || `${copy.resourceFallback ?? "Resource"} ${index + 1}`;

const hasPackageMetadata = (plan) =>
  ["name", "version", "description", "publisher", "source"].some(
    (key) => plan?.package?.[key],
  );

const hasPackageSummary = (plan) =>
  hasPackageMetadata(plan) || (plan?.warnings?.length ?? 0) > 0;

const getIncludedResourceIndexes = ({ plan, values }) =>
  plan.resources
    .map((_resource, index) => index)
    .filter((index) => values[`resource_${index}_include`] === true);

const getRequiredDependencySourceIds = ({ plan, values }) => {
  const resourceBySourceId = new Map(
    plan.resources.map((resource) => [resource.sourceId, resource]),
  );
  const selectedSourceIds = new Set(
    getIncludedResourceIndexes({ plan, values }).map(
      (index) => plan.resources[index].sourceId,
    ),
  );
  const requiredSourceIds = new Set();
  const pendingSourceIds = [...selectedSourceIds];
  while (pendingSourceIds.length > 0) {
    const sourceId = pendingSourceIds.pop();
    const resource = resourceBySourceId.get(sourceId);
    for (const dependencySourceId of resource?.dependencySourceIds ?? []) {
      if (!requiredSourceIds.has(dependencySourceId)) {
        requiredSourceIds.add(dependencySourceId);
        pendingSourceIds.push(dependencySourceId);
      }
    }
  }
  return requiredSourceIds;
};

const getOrderedReviewResources = ({ plan, values }) => {
  const requiredSourceIds = getRequiredDependencySourceIds({ plan, values });
  const dependencySourceIds = new Set(
    plan.resources.flatMap((resource) => resource.dependencySourceIds ?? []),
  );
  return plan.resources
    .map((resource, resourceIndex) => {
      const selected = values[`resource_${resourceIndex}_include`] === true;
      return {
        resource,
        resourceIndex,
        selected,
        selectionLocked: selected && requiredSourceIds.has(resource.sourceId),
      };
    })
    .sort((left, right) => {
      const leftGroup = dependencySourceIds.has(left.resource.sourceId) ? 1 : 0;
      const rightGroup = dependencySourceIds.has(right.resource.sourceId)
        ? 1
        : 0;
      return leftGroup - rightGroup || left.resourceIndex - right.resourceIndex;
    });
};

const formatResourceType = (resourceType = "resource") => {
  const label = resourceType.replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const RESOURCE_TYPE_COPY_KEYS = Object.freeze({
  animations: "animationTypeLabel",
  audioEffects: "audioEffectTypeLabel",
  characters: "characterTypeLabel",
  colors: "colorTypeLabel",
  controls: "controlTypeLabel",
  fonts: "fontTypeLabel",
  images: "imageTypeLabel",
  layouts: "layoutTypeLabel",
  particles: "particleTypeLabel",
  sounds: "soundTypeLabel",
  spritesheets: "spritesheetTypeLabel",
  textStyles: "textStyleTypeLabel",
  transforms: "transformTypeLabel",
  variables: "variableTypeLabel",
  videos: "videoTypeLabel",
});

const getResourceTypeLabel = ({ resource, copy }) => {
  const copyKey = RESOURCE_TYPE_COPY_KEYS[resource.resourceType];
  return (
    copy[copyKey] ?? formatResourceType(resource.type ?? resource.resourceType)
  );
};

const selectionForm = ({ state, copy }) => {
  const fields = [];
  if (hasPackageSummary(state.plan)) {
    fields.push({
      name: "packageSummary",
      type: "slot",
      slot: "package-summary",
    });
  }
  fields.push({
    type: "slot",
    slot: "selection-controls",
  });

  const resourceFields = getOrderedReviewResources({
    plan: state.plan,
    values: state.reviewValues,
  }).map(({ resourceIndex }) => ({
    type: "slot",
    slot: `resource-selection-${resourceIndex}`,
  }));
  for (let index = 0; index < resourceFields.length; index += 2) {
    const rowFields = resourceFields.slice(index, index + 2);
    if (rowFields.length === 1) {
      rowFields.push({
        type: "slot",
        slot: `resource-selection-spacer-${index}`,
      });
    }
    fields.push({
      type: "row",
      fields: rowFields,
    });
  }

  return {
    title: copy.selectResourcesTitle ?? "Choose Resources",
    fields,
    actions: {
      buttons: [
        {
          id: "back",
          variant: "se",
          label: copy.backButton ?? "Back",
        },
        {
          id: "import",
          variant: "pr",
          label: copy.importButton ?? "Import",
          validate: true,
        },
      ],
    },
  };
};

const createReviewValues = (plan) => {
  const values = {};
  plan.resources.forEach((resource, index) => {
    values[`resource_${index}_include`] = true;
    values[`resource_${index}_name`] = resource.name;
    values[`resource_${index}_description`] = resource.description ?? "";
  });
  return values;
};

export const createInitialState = () => ({
  open: false,
  step: SOURCE_STEP,
  sourceValues: { url: "" },
  reviewValues: {},
  plan: undefined,
  error: undefined,
  isBusy: false,
  operationId: undefined,
  progress: { phase: "downloading", completed: 0, total: 0 },
  formKey: 0,
});

export const syncFromProps = ({ state }, { props, reset = false } = {}) => {
  const wasOpen = state.open;
  state.open = props.open === true;

  if (reset || (!wasOpen && state.open)) {
    state.step = SOURCE_STEP;
    state.sourceValues = { url: "" };
    state.reviewValues = {};
    state.plan = undefined;
    state.error = undefined;
    state.isBusy = false;
    state.operationId = undefined;
    state.formKey += 1;
  }
};

export const setLoading = (
  { state },
  { loading, operationId, sourceValues } = {},
) => {
  state.isBusy = loading === true;
  state.operationId = operationId;
  state.error = undefined;
  if (sourceValues) state.sourceValues = sourceValues;
};

export const setPlan = ({ state }, { plan } = {}) => {
  state.plan = plan;
  state.reviewValues = createReviewValues(plan);
  state.step = SELECTION_STEP;
  state.isBusy = false;
  state.operationId = undefined;
  state.error = undefined;
  state.formKey += 1;
};

export const openSourceStep = ({ state }, { values } = {}) => {
  state.step = SOURCE_STEP;
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      state.reviewValues[key] = value;
    }
  }
  state.error = undefined;
  state.formKey += 1;
};

export const reopenLoadedPlan = ({ state }) => {
  if (!state.plan) return;
  state.step = SELECTION_STEP;
  state.error = undefined;
  state.formKey += 1;
};

export const saveReviewValues = ({ state }, { values } = {}) => {
  for (const [key, value] of Object.entries(values ?? {})) {
    state.reviewValues[key] = value;
  }
};

export const setResourceSelected = (
  { state },
  { resourceIndex, selected } = {},
) => {
  const resource = state.plan.resources[resourceIndex];
  if (selected !== true) {
    const requiredSourceIds = getRequiredDependencySourceIds({
      plan: state.plan,
      values: state.reviewValues,
    });
    if (requiredSourceIds.has(resource.sourceId)) return;
    state.reviewValues[`resource_${resourceIndex}_include`] = false;
    return;
  }

  const resourceIndexBySourceId = new Map(
    state.plan.resources.map((item, index) => [item.sourceId, index]),
  );
  const pendingSourceIds = [resource.sourceId];
  while (pendingSourceIds.length > 0) {
    const sourceId = pendingSourceIds.pop();
    const index = resourceIndexBySourceId.get(sourceId);
    if (index === undefined) continue;
    state.reviewValues[`resource_${index}_include`] = true;
    pendingSourceIds.push(
      ...(state.plan.resources[index].dependencySourceIds ?? []),
    );
  }
};

export const setAllResourcesSelected = ({ state }, { selected } = {}) => {
  state.plan.resources.forEach((_resource, index) => {
    state.reviewValues[`resource_${index}_include`] = selected === true;
  });
};

export const startExecution = ({ state }, { values, operationId } = {}) => {
  for (const [key, value] of Object.entries(values ?? {})) {
    state.reviewValues[key] = value;
  }
  state.step = PROGRESS_STEP;
  state.isBusy = true;
  state.operationId = operationId;
  state.error = undefined;
};

export const setProgress = ({ state }, { progress } = {}) => {
  state.progress = progress;
};

export const setError = ({ state }, { error, step } = {}) => {
  state.error = error;
  state.isBusy = false;
  state.operationId = undefined;
  if (step) state.step = step;
  state.formKey += 1;
};

export const selectPlan = ({ state }) => state.plan;
export const selectStep = ({ state }) => state.step;
export const selectOperationId = ({ state }) => state.operationId;
export const selectSourceValues = ({ state }) => state.sourceValues;
export const selectReviewValues = ({ state }) => state.reviewValues;
export const selectViewData = ({ state, i18n = {} }) => {
  const copy = i18n.resourceImport ?? {};
  const plan = state.plan;
  const warnings = (plan?.warnings ?? []).filter(
    (warning) => warning.code !== "name_conflict",
  );
  const progressPercent = state.progress.total
    ? Math.round((state.progress.completed / state.progress.total) * 100)
    : 0;
  const progressLabelByPhase = {
    downloading: copy.downloadingLabel ?? "Downloading package files",
    processing: copy.processingLabel ?? "Validating and processing files",
    committing: copy.committingLabel ?? "Saving imported resources",
    complete: copy.completeLabel ?? "Import complete",
  };
  const isSelectionStep = state.step === SELECTION_STEP;
  const allResourcesSelected =
    (plan?.resources.length ?? 0) > 0 &&
    plan.resources.every(
      (_resource, index) =>
        state.reviewValues[`resource_${index}_include`] === true,
    );
  const resources = plan
    ? getOrderedReviewResources({
        plan,
        values: state.reviewValues,
      }).map(({ resource, resourceIndex, selected, selectionLocked }) => ({
        ...resource,
        resourceIndex,
        typeLabel: getResourceTypeLabel({ resource, copy }),
        selectionSlot: `resource-selection-${resourceIndex}`,
        selectionLabel: (copy.includeResource ?? "Import {name}").replace(
          "{name}",
          getResourceLabel(resource, resourceIndex, copy),
        ),
        selected,
        selectionLocked,
        selectionTabIndex: selectionLocked ? -1 : 0,
        selectionCursor: selectionLocked ? "default" : "pointer",
        selectionBorderColor: selected ? "pr" : "bo",
        selectionHoverBorderColor: selected ? "pr" : "ac",
        selectionStatus: selectionLocked
          ? (copy.requiredStatus ?? "Required")
          : selected
            ? (copy.selectedStatus ?? "Selected")
            : (copy.notSelectedStatus ?? "Not selected"),
        selectionStatusColor: selected ? "pr" : "mu-fg",
      }))
    : [];

  return {
    open: state.open,
    step: state.step,
    isSourceStep: state.step === SOURCE_STEP,
    isSelectionStep,
    allResourcesSelected,
    selectionToggleAllLabel: allResourcesSelected
      ? (copy.deselectAllButton ?? "Deselect All")
      : (copy.selectAllButton ?? "Select All"),
    isProgressStep: state.step === PROGRESS_STEP,
    isBusy: state.isBusy,
    formKey: state.formKey,
    form: isSelectionStep ? selectionForm({ state, copy }) : sourceForm(copy),
    defaultValues: isSelectionStep ? state.reviewValues : state.sourceValues,
    formContext: state.reviewValues,
    errorMessage: state.error?.message,
    sourceDescription:
      copy.urlDescription ??
      "Paste the HTTPS import link supplied by the package publisher.",
    assetStoreLinkLabel: copy.assetStoreLinkLabel ?? "Browse the Asset Store",
    assetStoreUrl: ROUTEVN_ASSET_STORE_URL,
    packageName: plan?.package?.name,
    hasPackageMetadata: hasPackageMetadata(plan),
    hasPackageSummary: hasPackageSummary(plan),
    planId: plan?.planId,
    packageVersion: plan?.package?.version,
    packageDescription: plan?.package?.description,
    packagePublisher: plan?.package?.publisher,
    packageSource: plan?.package?.source,
    resources,
    warnings,
    knownDownloadBytes: plan?.knownDownloadBytes ?? 0,
    hasUnknownDownloadSize: plan?.hasUnknownDownloadSize === true,
    publisherLabel: copy.publisherLabel ?? "Publisher",
    sourceLabel: copy.sourceLabel ?? "Source",
    warningsLabel: copy.warningsLabel ?? "Warnings",
    unknownSizeLabel: copy.unknownSizeLabel ?? "plus files of unknown size",
    bytesLabel: copy.bytesLabel ?? "bytes",
    progressLabel:
      progressLabelByPhase[state.progress.phase] ??
      copy.preparingLabel ??
      "Preparing import",
    progressCountLabel: `${state.progress.completed} / ${state.progress.total}`,
    progressPercent,
    cancelButton: copy.cancelButton ?? "Cancel Import",
    dialogAriaLabel: copy.title ?? "Import Package",
  };
};
