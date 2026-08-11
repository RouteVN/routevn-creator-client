import { toFlatItems } from "../../internal/project/tree.js";
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

const SOURCE_STEP = "source";
const SELECTION_STEP = "selection";
const ITEM_STEP = "item";
const PROGRESS_STEP = "progress";
const ASSET_STORE_URL = "http://localhost:3003/en/creator/asset-store/";

const createImageSelectorDialogState = () => ({
  open: false,
  imageIndex: undefined,
  selectedImageId: undefined,
});

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
        copy.urlPlaceholder ?? "https://example.com/import/package.json",
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

const createFolderOptions = (collection) =>
  toFlatItems(collection ?? { items: {}, tree: [] })
    .filter((item) => item.type === "folder")
    .map((item) => ({
      label: item.fullLabel ?? item.name ?? item.id,
      value: item.id,
    }));

const getResourceLabel = (resource, index, copy) =>
  resource.name || `${copy.resourceFallback ?? "Resource"} ${index + 1}`;

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

const getSelectedResourceIndexes = ({ plan, values }) =>
  plan.resources
    .map((_resource, index) => index)
    .filter((index) => values[`resource_${index}_include`] === true);

const getResourceImageEntries = ({ plan, resource }) =>
  plan.images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) =>
      (image.usedByResourceIds ?? []).includes(resource.sourceId),
    );

const createImportedImageCondition = ({ plan, selectedResourceIndexes }) => {
  const selectedSourceIds = new Set(
    selectedResourceIndexes.map((index) => plan.resources[index].sourceId),
  );
  return plan.images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) =>
      (image.usedByResourceIds ?? []).some((sourceId) =>
        selectedSourceIds.has(sourceId),
      ),
    )
    .map(({ index }) => `image_${index}_mode == 'import'`)
    .join(" || ");
};

const createDestinationModeOptions = ({ options, copy }) => {
  const destinationOptions = [
    {
      label: copy.newFolderOption ?? "New Folder",
      value: "new",
    },
  ];
  if (options.length > 0) {
    destinationOptions.push({
      label: copy.existingFolderOption ?? "Existing Folder",
      value: "existing",
    });
  }
  return destinationOptions;
};

const appendResourceDestinationFields = ({ fields, state, copy }) => {
  const resourceFolderLabel =
    state.expectedResourceType === "animations"
      ? (copy.animationFolderLabel ?? "Animation Folder")
      : (copy.transformFolderLabel ?? "Transform Folder");
  fields.push({
    type: "row",
    fields: [
      {
        name: "resourceDestinationMode",
        type: "segmented-control",
        label: copy.destinationModeLabel ?? "Destination",
        noClear: true,
        required: true,
        options: createDestinationModeOptions({
          options: state.resourceFolderOptions,
          copy,
        }),
      },
      {
        $when: "resourceDestinationMode == 'existing'",
        name: "resourceParentId",
        type: "select",
        label: resourceFolderLabel,
        options: state.resourceFolderOptions,
        placeholder: copy.folderSelectPlaceholder ?? "Choose a folder",
        searchable: true,
        clearable: false,
        required: true,
      },
      {
        $when: "resourceDestinationMode == 'new'",
        name: "resourceNewFolderName",
        type: "input-text",
        label: (copy.newFolderNameLabel ?? "New {folder} Name").replace(
          "{folder}",
          resourceFolderLabel,
        ),
        placeholder: copy.folderNamePlaceholder ?? "Enter a folder name",
        required: {
          message: copy.folderNameRequired ?? "Folder name is required.",
        },
      },
    ],
  });
};

const appendImageDestinationFields = ({
  fields,
  state,
  copy,
  importedImageCondition,
}) => {
  if (!importedImageCondition) return;
  fields.push({
    $when: importedImageCondition,
    type: "row",
    fields: [
      {
        name: "imageDestinationMode",
        type: "segmented-control",
        label: copy.imageDestinationLabel ?? "Imported Image Destination",
        noClear: true,
        required: true,
        options: createDestinationModeOptions({
          options: state.imageFolderOptions,
          copy,
        }),
      },
      {
        $when: "imageDestinationMode == 'existing'",
        name: "imageParentId",
        type: "select",
        label: copy.imageFolderLabel ?? "Image Folder",
        options: state.imageFolderOptions,
        placeholder: copy.folderSelectPlaceholder ?? "Choose a folder",
        searchable: true,
        clearable: false,
        required: true,
      },
      {
        $when: "imageDestinationMode == 'new'",
        name: "imageNewFolderName",
        type: "input-text",
        label: copy.newImageFolderNameLabel ?? "New Image Folder Name",
        placeholder: copy.folderNamePlaceholder ?? "Enter a folder name",
        required: {
          message: copy.folderNameRequired ?? "Folder name is required.",
        },
      },
    ],
  });
};

const selectionForm = ({ state, copy }) => {
  const fields = [
    {
      name: "packageSummary",
      type: "slot",
      slot: "package-summary",
    },
    {
      type: "slot",
      slot: "selection-controls",
    },
  ];

  state.plan.resources.forEach((_resource, index) => {
    fields.push({
      type: "slot",
      slot: `resource-selection-${index}`,
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
  const selectedResourceIndexes = getSelectedResourceIndexes({
    plan: state.plan,
    values: state.reviewValues,
  });
  const currentPosition = selectedResourceIndexes.indexOf(
    state.currentResourceIndex,
  );
  const resource = state.plan.resources[state.currentResourceIndex];
  const resourceImages = getResourceImageEntries({
    plan: state.plan,
    resource,
  });
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

  if (!state.plan.assetPackage) {
    appendResourceDestinationFields({ fields, state, copy });
  }

  if (resourceImages.length > 0) {
    fields.push({ type: "slot", slot: "image-resources-header" });
    appendImageDestinationFields({
      fields,
      state,
      copy,
      importedImageCondition: createImportedImageCondition({
        plan: state.plan,
        selectedResourceIndexes,
      }),
    });
    fields.push({ type: "slot", slot: "image-resources-list" });
  }

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

const createReviewValues = ({ plan, state }) => {
  const resourceParentId = state.resourceFolderOptions.some(
    (option) => option.value === state.targetParentId,
  )
    ? state.targetParentId
    : state.resourceFolderOptions[0]?.value;
  const defaultFolderName = plan.package.defaultFolderName ?? plan.package.name;
  const values = {
    resourceDestinationMode: "new",
    resourceParentId,
    resourceNewFolderName: defaultFolderName,
    imageDestinationMode: "new",
    imageParentId: state.imageFolderOptions[0]?.value,
    imageNewFolderName: defaultFolderName,
  };
  plan.resources.forEach((resource, index) => {
    values[`resource_${index}_include`] = true;
    values[`resource_${index}_name`] = resource.name;
    values[`resource_${index}_description`] = resource.description ?? "";
  });
  plan.images.forEach((_image, index) => {
    values[`image_${index}_customized`] = false;
    values[`image_${index}_mode`] = "import";
    values[`image_${index}_existingId`] = undefined;
  });
  return values;
};

export const createInitialState = () => ({
  open: false,
  expectedResourceType: "animations",
  targetParentId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  step: SOURCE_STEP,
  sourceValues: { url: "" },
  reviewValues: {},
  plan: undefined,
  currentResourceIndex: undefined,
  resourceFolderOptions: [],
  imageFolderOptions: [],
  imageSelectorDialog: createImageSelectorDialogState(),
  error: undefined,
  isBusy: false,
  operationId: undefined,
  progress: { phase: "downloading", completed: 0, total: 0 },
  formKey: 0,
});

export const syncFromProps = (
  { state },
  { props, repositoryState, reset = false } = {},
) => {
  const wasOpen = state.open;
  state.open = props.open === true;
  state.expectedResourceType = props.expectedResourceType ?? "animations";
  state.targetParentId = props.targetParentId;
  state.projectResolution =
    props.projectResolution ?? DEFAULT_PROJECT_RESOLUTION;
  state.resourceFolderOptions = createFolderOptions(
    repositoryState?.[state.expectedResourceType],
  );
  state.imageFolderOptions = createFolderOptions(repositoryState?.images);

  if (reset || (!wasOpen && state.open)) {
    state.step = SOURCE_STEP;
    state.sourceValues = { url: "" };
    state.reviewValues = {};
    state.plan = undefined;
    state.currentResourceIndex = undefined;
    state.imageSelectorDialog = createImageSelectorDialogState();
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
  state.reviewValues = createReviewValues({ plan, state });
  state.imageSelectorDialog = createImageSelectorDialogState();
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
  state.reviewValues[`resource_${resourceIndex}_include`] = selected === true;
};

export const setAllResourcesSelected = ({ state }, { selected } = {}) => {
  state.plan.resources.forEach((_resource, index) => {
    state.reviewValues[`resource_${index}_include`] = selected === true;
  });
};

export const openImageSelector = ({ state }, { imageIndex } = {}) => {
  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.imageIndex = imageIndex;
  state.imageSelectorDialog.selectedImageId =
    state.reviewValues[`image_${imageIndex}_existingId`];
};

export const closeImageSelector = ({ state }) => {
  state.imageSelectorDialog = createImageSelectorDialogState();
};

export const setSelectedReplacementImage = ({ state }, { imageId } = {}) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const confirmImageReplacement = ({ state }) => {
  const imageIndex = state.imageSelectorDialog.imageIndex;
  const imageId = state.imageSelectorDialog.selectedImageId;
  if (!imageId) return;

  state.reviewValues[`image_${imageIndex}_customized`] = true;
  state.reviewValues[`image_${imageIndex}_mode`] = "existing";
  state.reviewValues[`image_${imageIndex}_existingId`] = imageId;
  state.imageSelectorDialog = createImageSelectorDialogState();
};

export const useDefaultImage = ({ state }, { imageIndex } = {}) => {
  state.reviewValues[`image_${imageIndex}_customized`] = false;
  state.reviewValues[`image_${imageIndex}_mode`] = "import";
  state.reviewValues[`image_${imageIndex}_existingId`] = undefined;
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
export const selectImageSelectorDialog = ({ state }) =>
  state.imageSelectorDialog;

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
  const currentResource = isItemStep
    ? plan?.resources[state.currentResourceIndex]
    : undefined;
  const currentImages = currentResource
    ? getResourceImageEntries({ plan, resource: currentResource }).map(
        ({ image, index }) => ({
          ...image,
          imageIndex: index,
          customized: state.reviewValues[`image_${index}_customized`] === true,
          replacementImageId: state.reviewValues[`image_${index}_existingId`],
        }),
      )
    : [];
  const animationTimeline = createAnimationTimelinePreview({
    resource: currentResource,
    projectResolution: state.projectResolution,
    copy,
  });

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
    assetStoreUrl: ASSET_STORE_URL,
    packageName: plan?.package?.name,
    packageVersion: plan?.package?.version,
    packageDescription: plan?.package?.description,
    packagePublisher: plan?.package?.publisher,
    packageSource: plan?.package?.source,
    resources:
      plan?.resources.map((resource, index) => {
        const selected =
          state.reviewValues[`resource_${index}_include`] === true;
        return {
          ...resource,
          selectionSlot: `resource-selection-${index}`,
          selectionLabel: (copy.includeResource ?? "Import {name}").replace(
            "{name}",
            getResourceLabel(resource, index, copy),
          ),
          selected,
          selectionBorderColor: selected ? "pr" : "bo",
          selectionHoverBorderColor: selected ? "pr" : "ac",
          selectionStatus: selected
            ? (copy.selectedStatus ?? "Selected")
            : (copy.notSelectedStatus ?? "Not selected"),
          selectionStatusColor: selected ? "pr" : "mu-fg",
        };
      }) ?? [],
    currentResource,
    currentImages,
    imageSelectorDialog: state.imageSelectorDialog,
    animationTimeline,
    warnings,
    unsupportedResourceTypes: plan?.unsupportedResourceTypes ?? [],
    knownDownloadBytes: plan?.knownDownloadBytes ?? 0,
    hasUnknownDownloadSize: plan?.hasUnknownDownloadSize === true,
    packageSummaryLabel: copy.packageSummaryLabel ?? "Package",
    publisherLabel: copy.publisherLabel ?? "Publisher",
    sourceLabel: copy.sourceLabel ?? "Source",
    primaryLabel: copy.primaryLabel ?? "Primary",
    resourcesLabel: copy.resourcesLabel ?? "Resources",
    mediaLabel: copy.mediaLabel ?? "Media dependencies",
    imageResourcesLabel: copy.imageResourcesLabel ?? "Image Resources",
    customizeImageButton: copy.customizeImageButton ?? "Customize",
    useDefaultImageButton: copy.useDefaultImageButton ?? "Use Default",
    imageSelectorTitle: copy.imageSelectorTitle ?? "Choose a Replacement Image",
    selectButton: copy.selectButton ?? "Select",
    warningsLabel: copy.warningsLabel ?? "Warnings",
    unsupportedLabel: copy.unsupportedLabel ?? "Not imported",
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
