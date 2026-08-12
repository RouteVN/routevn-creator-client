import {
  getTransitionTimelineDuration,
  getUpdateAnimationTween,
} from "../../internal/animationDisplay.js";
import {
  createDefaultInitialValuesByProperty,
  createPropertyFieldConfig,
} from "../../internal/animationPreview.js";
import { createDefaultTransitionMask } from "../../internal/animationMasks.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";
import { ROUTEVN_ASSET_STORE_URL } from "../../internal/routevnUrls.js";

const SOURCE_STEP = "source";
const SELECTION_STEP = "selection";
const ITEM_STEP = "item";
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

const createMaskProgressProperty = (mask = {}) => {
  if (mask.progress?.keyframes?.length > 0) {
    const progress = structuredClone(mask.progress);
    const maskDelay = Math.max(0, Number(mask.delay) || 0);
    if (maskDelay > 0 && progress.keyframes?.length > 0) {
      progress.keyframes[0].delay =
        maskDelay + Math.max(0, Number(progress.keyframes[0].delay) || 0);
    }
    return progress;
  }

  const defaultMask = createDefaultTransitionMask();
  const keyframe = {
    duration: Math.max(
      1,
      Number(mask.progressDuration) || defaultMask.progressDuration,
    ),
    value: 1,
    easing: mask.progressEasing ?? defaultMask.progressEasing,
  };
  const delay =
    Math.max(0, Number(mask.delay) || 0) +
    Math.max(0, Number(mask.progressDelay) || 0);
  if (delay > 0) keyframe.delay = delay;
  return { initialValue: 0, keyframes: [keyframe] };
};

const createMaskTimelineProperties = (mask, copy = {}) => {
  const masks = Array.isArray(mask) ? mask : mask ? [mask] : [];
  const maskLabel = copy.timelineMaskLabel ?? "Mask";
  return Object.fromEntries(
    masks.map((item, index) => [
      masks.length === 1 ? maskLabel : `${maskLabel} ${index + 1}`,
      createMaskProgressProperty(item),
    ]),
  );
};

const createAnimationTimelinePreview = ({
  resource,
  projectResolution,
  copy,
}) => {
  if (resource?.type !== "animation" || !resource.data?.animation) {
    return undefined;
  }

  const animation = resource.data.animation;
  const isTransition = animation.type === "transition";
  const previousProperties =
    isTransition && animation.prev?.tween ? animation.prev.tween : {};
  const nextProperties =
    isTransition && animation.next?.tween ? animation.next.tween : {};
  const maskProperties = createMaskTimelineProperties(animation.mask, copy);
  const updateProperties = getUpdateAnimationTween(resource.data);
  const defaultValues = createDefaultInitialValuesByProperty(
    createPropertyFieldConfig(projectResolution),
  );
  defaultValues[copy.timelineMaskLabel ?? "Mask"] = 0;

  return {
    isTransition,
    previousProperties,
    nextProperties,
    maskProperties,
    updateProperties,
    hasPreviousProperties: Object.keys(previousProperties).length > 0,
    hasNextProperties: Object.keys(nextProperties).length > 0,
    hasMaskProperties: Object.keys(maskProperties).length > 0,
    timelineDuration: isTransition
      ? getTransitionTimelineDuration({
          prevProperties: previousProperties,
          nextProperties,
          mask: animation.mask,
        })
      : undefined,
    defaultValues,
  };
};

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
      const leftGroup = left.selectionLocked ? 2 : left.selected ? 0 : 1;
      const rightGroup = right.selectionLocked ? 2 : right.selected ? 0 : 1;
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

  getOrderedReviewResources({
    plan: state.plan,
    values: state.reviewValues,
  }).forEach(({ resourceIndex }) => {
    fields.push({
      type: "slot",
      slot: `resource-selection-${resourceIndex}`,
    });
  });

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
          id: "select-continue",
          variant: "pr",
          label: copy.selectionContinueButton ?? "Continue",
          validate: true,
        },
      ],
    },
  };
};

const itemForm = ({ state, copy }) => {
  const selectedResourceIndexes = getOrderedReviewResources({
    plan: state.plan,
    values: state.reviewValues,
  })
    .filter(({ selected }) => selected)
    .map(({ resourceIndex }) => resourceIndex);
  const currentPosition = selectedResourceIndexes.indexOf(
    state.currentResourceIndex,
  );
  const resource = state.plan.resources[state.currentResourceIndex];
  const isLast = currentPosition === selectedResourceIndexes.length - 1;
  const fields = [];
  if (state.plan.resources.length === 1) {
    fields.push({ type: "slot", slot: "package-summary" });
  }
  fields.push({ type: "slot", slot: "resource-preview" });
  if (resource.type === "animation") {
    fields.push({ type: "slot", slot: "animation-timeline-preview" });
  }
  fields.push({
    type: "row",
    fields: [
      {
        name: `resource_${state.currentResourceIndex}_name`,
        type: "input-text",
        label: copy.resourceNameLabel ?? "Resource Name",
        placeholder: copy.resourceNamePlaceholder ?? "Enter a resource name",
        required: true,
      },
      {
        name: `resource_${state.currentResourceIndex}_description`,
        type: "input-textarea",
        label: copy.resourceDescriptionLabel ?? "Resource Description",
        placeholder:
          copy.resourceDescriptionPlaceholder ?? "Enter a resource description",
        rows: 3,
      },
    ],
  });

  const title = (copy.customizeResourceTitle ?? "Customize {name}").replace(
    "{name}",
    resource.name,
  );
  const description = (copy.itemProgressLabel ?? "Item {current} of {total}")
    .replace("{current}", `${currentPosition + 1}`)
    .replace("{total}", `${selectedResourceIndexes.length}`);
  return {
    title,
    description,
    fields,
    actions: {
      buttons: [
        {
          id: "back",
          variant: "se",
          label: copy.backButton ?? "Back",
        },
        {
          id: isLast ? "import" : "next",
          variant: "pr",
          label: isLast
            ? (copy.submitAllButton ?? "Submit All")
            : (copy.nextButton ?? "Next"),
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
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  step: SOURCE_STEP,
  sourceValues: { url: "" },
  reviewValues: {},
  plan: undefined,
  currentResourceIndex: undefined,
  error: undefined,
  isBusy: false,
  operationId: undefined,
  progress: { phase: "downloading", completed: 0, total: 0 },
  formKey: 0,
});

export const syncFromProps = ({ state }, { props, reset = false } = {}) => {
  const wasOpen = state.open;
  state.open = props.open === true;
  state.projectResolution =
    props.projectResolution ?? DEFAULT_PROJECT_RESOLUTION;

  if (reset || (!wasOpen && state.open)) {
    state.step = SOURCE_STEP;
    state.sourceValues = { url: "" };
    state.reviewValues = {};
    state.plan = undefined;
    state.currentResourceIndex = undefined;
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
  state.currentResourceIndex = plan.resources.length === 1 ? 0 : undefined;
  state.step = plan.resources.length === 1 ? ITEM_STEP : SELECTION_STEP;
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
  state.currentResourceIndex =
    state.plan.resources.length === 1 ? 0 : undefined;
  state.step = state.plan.resources.length === 1 ? ITEM_STEP : SELECTION_STEP;
  state.error = undefined;
  state.formKey += 1;
};

export const openSelectionStep = ({ state }, { values } = {}) => {
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      state.reviewValues[key] = value;
    }
  }
  state.currentResourceIndex = undefined;
  state.step = SELECTION_STEP;
  state.error = undefined;
  state.formKey += 1;
};

export const openItemStep = ({ state }, { values, resourceIndex } = {}) => {
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      state.reviewValues[key] = value;
    }
  }
  state.currentResourceIndex = resourceIndex;
  state.step = ITEM_STEP;
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
export const selectCurrentResourceIndex = ({ state }) =>
  state.currentResourceIndex;
export const selectOrderedSelectedResourceIndexes = (
  { state },
  { values } = {},
) =>
  getOrderedReviewResources({
    plan: state.plan,
    values: values ?? state.reviewValues,
  })
    .filter(({ selected }) => selected)
    .map(({ resourceIndex }) => resourceIndex);
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
  const isItemStep = state.step === ITEM_STEP;
  const allResourcesSelected =
    (plan?.resources.length ?? 0) > 0 &&
    plan.resources.every(
      (_resource, index) =>
        state.reviewValues[`resource_${index}_include`] === true,
    );
  const rawCurrentResource = isItemStep
    ? plan?.resources[state.currentResourceIndex]
    : undefined;
  const currentResource = rawCurrentResource
    ? {
        ...rawCurrentResource,
        typeLabel: getResourceTypeLabel({
          resource: rawCurrentResource,
          copy,
        }),
      }
    : undefined;
  const animationTimeline = createAnimationTimelinePreview({
    resource: currentResource,
    projectResolution: state.projectResolution,
    copy,
  });
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
    isItemStep,
    allResourcesSelected,
    selectionToggleAllLabel: allResourcesSelected
      ? (copy.deselectAllButton ?? "Deselect All")
      : (copy.selectAllButton ?? "Select All"),
    isReviewStep: isSelectionStep || isItemStep,
    isProgressStep: state.step === PROGRESS_STEP,
    isBusy: state.isBusy,
    formKey: state.formKey,
    form: isSelectionStep
      ? selectionForm({ state, copy })
      : isItemStep
        ? itemForm({ state, copy })
        : sourceForm(copy),
    defaultValues:
      isSelectionStep || isItemStep ? state.reviewValues : state.sourceValues,
    formContext: state.reviewValues,
    errorMessage: state.error?.message,
    sourceDescription:
      copy.urlDescription ??
      "Paste the HTTPS import link supplied by the package publisher.",
    assetStoreLinkLabel: copy.assetStoreLinkLabel ?? "Browse the Asset Store",
    assetStoreUrl: ROUTEVN_ASSET_STORE_URL,
    packageName: plan?.package?.name,
    hasPackageMetadata: hasPackageMetadata(plan),
    hasPackageSummary:
      hasPackageSummary(plan) ||
      (isItemStep && (plan?.resources.length ?? 0) === 1),
    planId: plan?.planId,
    packageVersion: plan?.package?.version,
    packageDescription: plan?.package?.description,
    packagePublisher: plan?.package?.publisher,
    packageSource: plan?.package?.source,
    resources,
    currentResource,
    animationTimeline,
    warnings,
    knownDownloadBytes: plan?.knownDownloadBytes ?? 0,
    hasUnknownDownloadSize: plan?.hasUnknownDownloadSize === true,
    publisherLabel: copy.publisherLabel ?? "Publisher",
    sourceLabel: copy.sourceLabel ?? "Source",
    warningsLabel: copy.warningsLabel ?? "Warnings",
    unknownSizeLabel: copy.unknownSizeLabel ?? "plus files of unknown size",
    bytesLabel: copy.bytesLabel ?? "bytes",
    timelinePreviewLabel: copy.timelinePreviewLabel ?? "Timeline",
    timelineOutLabel: copy.timelineOutLabel ?? "Out",
    timelineInLabel: copy.timelineInLabel ?? "In",
    timelineMaskLabel: copy.timelineMaskLabel ?? "Mask",
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
