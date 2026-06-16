import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  formatBackgroundTransformEditorMetric,
  normalizeBackgroundTransformEditorTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";

const tabs = [
  {
    id: "image",
    label: "Images",
  },
  {
    id: "layout",
    label: "Layouts",
  },
  {
    id: "video",
    label: "Videos",
  },
];

const ANIMATION_PLAYBACK_CONTINUITY_OPTIONS = [
  {
    label: "Single Line",
    value: "render",
  },
  {
    label: "Persistent",
    value: "persistent",
  },
];

const DEFAULT_BACKGROUND_OPACITY = 1;
const BACKGROUND_RESOURCE_CARD_ASPECT_RATIO = "16 / 9";
const DEFAULT_BACKGROUND_BLUR = {
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
};
const BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];

// Form structure will be created dynamically in selectViewData
const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const normalizeResourceCollection = (collection) => {
  const sourceItems =
    collection && typeof collection.items === "object" && collection.items
      ? collection.items
      : {};
  const items = { ...sourceItems };
  const tree = Array.isArray(collection?.tree) ? collection.tree : [];

  return { items, tree };
};

const getAnimationType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

const getAnimationItemById = (collection = {}, animationId) => {
  if (!animationId) {
    return undefined;
  }

  return toFlatItems(collection).find(
    (item) => item.id === animationId && item.type === "animation",
  );
};

const getAnimationModeById = (collection = {}, animationId) => {
  const item = getAnimationItemById(collection, animationId);
  return item ? getAnimationType(item) : undefined;
};

const normalizeBackgroundOpacity = (opacity) => {
  if (opacity === undefined || opacity === null || opacity === "") {
    return undefined;
  }

  const parsedOpacity = Number(opacity);
  if (!Number.isFinite(parsedOpacity)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, parsedOpacity));
};

const normalizeBackgroundBlurNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const normalizeBackgroundBlurBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true";
};

const normalizeBackgroundBlurKernelSize = (value) => {
  const parsedValue = normalizeBackgroundBlurNumber(
    value,
    DEFAULT_BACKGROUND_BLUR.kernelSize,
  );

  if (BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS.includes(parsedValue)) {
    return parsedValue;
  }

  return BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS.reduce((closest, option) => {
    const currentDistance = Math.abs(option - parsedValue);
    const closestDistance = Math.abs(closest - parsedValue);
    return currentDistance < closestDistance ? option : closest;
  }, DEFAULT_BACKGROUND_BLUR.kernelSize);
};

const normalizeBackgroundBlur = (blur = {}) => {
  const source =
    blur && typeof blur === "object" && !Array.isArray(blur) ? blur : {};

  return {
    x: normalizeBackgroundBlurNumber(source.x, DEFAULT_BACKGROUND_BLUR.x),
    y: normalizeBackgroundBlurNumber(source.y, DEFAULT_BACKGROUND_BLUR.y),
    quality: normalizeBackgroundBlurNumber(
      source.quality,
      DEFAULT_BACKGROUND_BLUR.quality,
    ),
    kernelSize: normalizeBackgroundBlurKernelSize(source.kernelSize),
    repeatEdgePixels: normalizeBackgroundBlurBoolean(
      source.repeatEdgePixels,
      DEFAULT_BACKGROUND_BLUR.repeatEdgePixels,
    ),
  };
};

export const createInitialState = () => ({
  mode: "current",
  tab: "image",
  imageItems: createEmptyCollection(),
  layoutItems: createEmptyCollection(),
  videoItems: createEmptyCollection(),
  animationItems: createEmptyCollection(),
  transformItems: createEmptyCollection(),
  colorItems: createEmptyCollection(),
  customTransformEnabled: false,
  selectedCustomTransform: undefined,
  customTransformEditorOpen: false,
  selectedResourceId: undefined,
  selectedResourceType: undefined,
  tempSelectedResourceId: undefined,
  tempSelectedResourceType: undefined,
  selectedTransformId: undefined,
  selectedColorId: undefined,
  selectedOpacity: undefined,
  selectedBlurEnabled: false,
  selectedBlurExplicit: false,
  selectedBlur: { ...DEFAULT_BACKGROUND_BLUR },
  selectedAnimationMode: "none",
  selectedAnimationId: undefined,
  selectedAnimationPlaybackContinuity: "render",
  backgroundLoop: false,
  pendingResourceId: undefined,
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  searchQuery: "",
});

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const selectTempSelectedResource = ({ state }) => {
  const resourceId = state.tempSelectedResourceId;
  const resourceType = state.tempSelectedResourceType ?? state.tab;

  if (!resourceId || !resourceType) {
    return null;
  }

  return selectResourceById({ state }, { resourceId, resourceType });
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const setRepositoryState = (
  { state },
  { images, layouts, videos, animations, transforms, colors } = {},
) => {
  state.imageItems = normalizeResourceCollection(images);
  state.layoutItems = normalizeResourceCollection(layouts);
  state.videoItems = normalizeResourceCollection(videos);
  state.animationItems = normalizeResourceCollection(animations);
  state.transformItems = normalizeResourceCollection(transforms);
  state.colorItems = normalizeResourceCollection(colors);

  const selectedAnimationMode = getAnimationModeById(
    state.animationItems,
    state.selectedAnimationId,
  );
  if (selectedAnimationMode) {
    state.selectedAnimationMode = selectedAnimationMode;
  }
};

export const setTab = ({ state }, { tab } = {}) => {
  state.tab = tab;
};

export const setSelectedResource = (
  { state },
  { resourceId, resourceType } = {},
) => {
  state.selectedResourceId = resourceId;
  state.selectedResourceType = resourceType;

  // Automatically set the tab based on resource type
  if (resourceType) {
    state.tab = resourceType;
  }
};

export const setTempSelectedResource = (
  { state },
  { resourceId, resourceType } = {},
) => {
  state.tempSelectedResourceId = resourceId;
  state.tempSelectedResourceType = resourceType ?? state.tab;
};

export const setPendingResourceId = ({ state }, { resourceId } = {}) => {
  state.pendingResourceId = resourceId;
};

export const selectPendingResourceId = ({ state }) => {
  return state.pendingResourceId;
};

export const clearPendingResourceId = ({ state }, _payload = {}) => {
  state.pendingResourceId = undefined;
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  const item = state.imageItems.items[imageId];
  if (!(item?.type === "image") || !item.fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = item.fileId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const setSelectedAnimationMode = ({ state }, { mode } = {}) => {
  if (mode !== "update" && mode !== "transition") {
    state.selectedAnimationMode = "none";
    state.selectedAnimationId = undefined;
    return;
  }

  state.selectedAnimationMode = mode;

  const selectedAnimationMode = getAnimationModeById(
    state.animationItems,
    state.selectedAnimationId,
  );
  if (selectedAnimationMode && selectedAnimationMode !== mode) {
    state.selectedAnimationId = undefined;
  }
};

export const selectSelectedAnimationMode = ({ state }) => {
  return state.selectedAnimationMode;
};

export const setSelectedAnimation = ({ state }, { animationId } = {}) => {
  state.selectedAnimationId = animationId === "none" ? undefined : animationId;

  const selectedAnimationMode = getAnimationModeById(
    state.animationItems,
    state.selectedAnimationId,
  );
  if (selectedAnimationMode) {
    state.selectedAnimationMode = selectedAnimationMode;
  } else if (!state.selectedAnimationId) {
    state.selectedAnimationMode = "none";
  }
};

export const selectSelectedAnimation = ({ state }) => {
  return state.selectedAnimationId;
};

export const setSelectedTransform = ({ state }, { transformId } = {}) => {
  state.selectedTransformId =
    typeof transformId === "string" && transformId.length > 0
      ? transformId
      : undefined;
};

export const selectSelectedTransform = ({ state }) => {
  return state.selectedTransformId;
};

export const selectSelectedTransformResource = ({ state }) => {
  if (!state.selectedTransformId) {
    return undefined;
  }

  return toFlatItems(state.transformItems).find(
    (item) => item.id === state.selectedTransformId,
  );
};

export const setCustomTransformEnabled = ({ state }, { enabled } = {}) => {
  state.customTransformEnabled = enabled === true || enabled === "true";
};

export const selectCustomTransformEnabled = ({ state }) => {
  return state.customTransformEnabled;
};

export const setCustomTransform = ({ state }, { transform } = {}) => {
  state.selectedCustomTransform = transform
    ? normalizeBackgroundTransformEditorTransform(transform)
    : undefined;
};

export const selectCustomTransform = ({ state }) => {
  return state.selectedCustomTransform;
};

export const openCustomTransformEditor = ({ state }, _payload = {}) => {
  state.customTransformEditorOpen = true;
};

export const closeCustomTransformEditor = ({ state }, _payload = {}) => {
  state.customTransformEditorOpen = false;
};

export const selectCustomTransformEditorOpen = ({ state }) => {
  return state.customTransformEditorOpen === true;
};

export const setSelectedColor = ({ state }, { colorId } = {}) => {
  state.selectedColorId =
    typeof colorId === "string" && colorId.length > 0 ? colorId : undefined;
};

export const selectSelectedColor = ({ state }) => {
  return state.selectedColorId;
};

export const setSelectedOpacity = ({ state }, { opacity } = {}) => {
  state.selectedOpacity = normalizeBackgroundOpacity(opacity);
};

export const selectSelectedOpacity = ({ state }) => {
  return state.selectedOpacity;
};

export const setSelectedBlurEnabled = ({ state }, { enabled } = {}) => {
  state.selectedBlurEnabled = enabled === true || enabled === "true";
  state.selectedBlurExplicit = true;
};

export const setSelectedBlur = ({ state }, { blur } = {}) => {
  state.selectedBlurExplicit = true;
  if (blur === null) {
    state.selectedBlurEnabled = false;
    return;
  }

  state.selectedBlurEnabled = true;
  state.selectedBlur = normalizeBackgroundBlur(blur);
};

export const setSelectedBlurField = ({ state }, { fieldName, value } = {}) => {
  state.selectedBlurExplicit = true;
  state.selectedBlur = normalizeBackgroundBlur({
    ...state.selectedBlur,
    [fieldName]: value,
  });
};

export const selectSelectedBlur = ({ state }) => {
  return state.selectedBlurEnabled
    ? normalizeBackgroundBlur(state.selectedBlur)
    : undefined;
};

export const selectSelectedBlurActionValue = ({ state }) => {
  if (state.selectedBlurEnabled) {
    return normalizeBackgroundBlur(state.selectedBlur);
  }

  if (state.selectedBlurExplicit) {
    return null;
  }

  return undefined;
};

export const setSelectedAnimationPlaybackContinuity = (
  { state },
  { continuity } = {},
) => {
  state.selectedAnimationPlaybackContinuity =
    continuity === "persistent" ? "persistent" : "render";
};

export const selectSelectedAnimationPlaybackContinuity = ({ state }) => {
  return state.selectedAnimationPlaybackContinuity;
};

export const setBackgroundLoop = ({ state }, { loop } = {}) => {
  state.backgroundLoop = loop;
};

export const selectBackgroundLoop = ({ state }) => {
  return state.backgroundLoop;
};

export const selectTab = ({ state }) => {
  return state.tab;
};

export const selectBreadcrumb = ({ state }) => {
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "gallery") {
    breadcrumb.push({
      id: "current",
      label: "Background",
      click: true,
    });
    breadcrumb.push({
      label: "Select",
    });
  } else {
    breadcrumb.push({
      label: "Background",
    });
  }

  return breadcrumb;
};

export const selectSelectedResource = ({ state }) => {
  if (!state.selectedResourceId || !state.selectedResourceType) {
    return null;
  }

  return selectResourceById(
    { state },
    {
      resourceId: state.selectedResourceId,
      resourceType: state.selectedResourceType,
    },
  );
};

const selectResourceById = ({ state }, { resourceId, resourceType } = {}) => {
  if (!resourceId || !resourceType) {
    return null;
  }

  const itemsMap = {
    image: state.imageItems,
    layout: state.layoutItems,
    video: state.videoItems,
  };

  const itemsList = itemsMap[resourceType] || [];
  const flatItems = toFlatItems(itemsList);
  const item = flatItems.find((item) => item.id === resourceId);

  if (!item) {
    return null;
  }

  const layoutTypeLabels = {
    general: "General",
    "save-load": "Save / Load",
    confirmDialog: "Confirm Dialog",
    history: "History",
    "dialogue-adv": "Dialogue ADV",
    "dialogue-nvl": "Dialogue NVL",
    choice: "Choice",
  };

  const typeInfo = layoutTypeLabels[item.layoutType] ?? item.layoutType;

  return {
    resourceId,
    resourceType,
    fileId: item.thumbnailFileId ?? item.fileId,
    previewAspectRatio: BACKGROUND_RESOURCE_CARD_ASPECT_RATIO,
    resourceCardStyle: "max-width: 100%; box-sizing: border-box;",
    name: item.name,
    itemBorderColor: "bo",
    itemHoverBorderColor: "ac",
    typeInfo,
    layoutType: item.layoutType,
    layoutTypeDisplay: item.layoutType
      ? layoutTypeLabels[item.layoutType] || item.layoutType
      : "Layout",
    item: item,
    tab: resourceType,
  };
};

const createBackgroundTransformEditorViewData = ({ state, props = {} }) => {
  const editor = props.backgroundTransformEditor ?? {};
  const transform = normalizeBackgroundTransformEditorTransform(
    editor.transform ?? state.selectedCustomTransform,
  );
  const metrics = editor.metrics ?? {
    x: formatBackgroundTransformEditorMetric(transform.x),
    y: formatBackgroundTransformEditorMetric(transform.y),
    scaleX: formatBackgroundTransformEditorMetric(transform.scaleX),
    scaleY: formatBackgroundTransformEditorMetric(transform.scaleY),
    rotation: formatBackgroundTransformEditorMetric(transform.rotation),
  };

  return {
    isOpen: state.customTransformEditorOpen === true || editor.isOpen === true,
    canvasAspectRatio: editor.canvasAspectRatio ?? "16 / 9",
    previewMaxWidth:
      editor.previewMaxWidth ??
      "min(100vw, calc((100vh - 122px) * 1.7777777778))",
    metrics,
  };
};

const createCustomTransformDetails = ({ state }) => {
  const transform = normalizeBackgroundTransformEditorTransform(
    state.selectedCustomTransform,
  );

  return [
    {
      label: "Position",
      value: `${formatBackgroundTransformEditorMetric(transform.x)}, ${formatBackgroundTransformEditorMetric(transform.y)}`,
    },
    {
      label: "Scale",
      value: `${formatBackgroundTransformEditorMetric(transform.scaleX)} x ${formatBackgroundTransformEditorMetric(transform.scaleY)}`,
    },
  ];
};

export const selectViewData = ({ state, props = {} }) => {
  const itemsMap = {
    image: state.imageItems,
    layout: state.layoutItems,
    video: state.videoItems,
  };
  const items = itemsMap[state.tab] || createEmptyCollection();
  const flatItems = toFlatItems(items).filter((item) => item.type === "folder");
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const flatGroups = toFlatGroups(items)
    .map((group) => {
      const children = group.children
        .filter(
          (layout) => state.tab !== "layout" || layout.layoutType === "general",
        )
        .filter(matchesSearch)
        .map((child) => {
          const isSelected = child.id === state.tempSelectedResourceId;
          const itemBorderColor = isSelected ? "pr" : "bo";
          const itemHoverBorderColor = isSelected ? "pr" : "ac";
          const selectedResourceInsetStyle = isSelected
            ? " box-shadow: inset 0 0 0 1px var(--color-pr);"
            : "";
          const resourceCardStyle =
            "max-width: 100%; box-sizing: border-box;" +
            selectedResourceInsetStyle;
          const layoutTypeLabels = {
            general: "General",
            "save-load": "Save / Load",
            confirmDialog: "Confirm Dialog",
            history: "History",
            "dialogue-adv": "Dialogue ADV",
            "dialogue-nvl": "Dialogue NVL",
            choice: "Choice",
          };

          return {
            ...child,
            itemBorderColor,
            itemHoverBorderColor,
            previewFileId: child.thumbnailFileId ?? child.fileId,
            previewAspectRatio: BACKGROUND_RESOURCE_CARD_ASPECT_RATIO,
            resourceCardStyle,
            typeInfo: layoutTypeLabels[child.layoutType] ?? child.layoutType,
            layoutTypeDisplay: child.layoutType
              ? layoutTypeLabels[child.layoutType] || child.layoutType
              : "Layout",
          };
        });

      return {
        ...group,
        children,
        hasChildren: children.length > 0,
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });
  const selectedAnimationMode = state.selectedAnimationMode ?? "none";
  const allAnimationItems = toFlatItems(state.animationItems).filter(
    (item) => item.type === "animation",
  );
  const animationOptions = allAnimationItems.map((item) => ({
    value: item.id,
    label: item.name,
    suffixText:
      getAnimationType(item) === "transition" ? "Transition" : "Update",
  }));
  const transformOptions = toFlatItems(state.transformItems)
    .filter((item) => item.type === "transform")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const colorOptions = toFlatItems(state.colorItems)
    .filter((item) => item.type === "color")
    .map((item) => ({
      value: item.id,
      label: item.name ?? item.id,
    }));

  const formFields = [
    {
      type: "slot",
      slot: "background",
      description: "Background",
    },
    {
      name: "colorId",
      label: "Background Color",
      type: "select",
      clearable: true,
      placeholder: "Select color",
      options: colorOptions,
    },
    {
      name: "customTransform",
      label: "Transform",
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "Predefined" },
        { value: true, label: "Custom" },
      ],
    },
    {
      $when: "customTransform == false",
      name: "transformId",
      label: "Predefined Transform",
      type: "select",
      clearable: true,
      placeholder: "Select transform",
      options: transformOptions,
    },
    {
      $when: "customTransform == true",
      type: "slot",
      slot: "custom-transform",
    },
    {
      name: "opacity",
      label: "Opacity",
      type: "slider-with-input",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: "blur",
      label: "Blur",
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "No Blur" },
        { value: true, label: "Blur" },
      ],
    },
    {
      $when: "blur == true",
      name: "blurX",
      label: "Blur X",
      type: "input-number",
    },
    {
      $when: "blur == true",
      name: "blurY",
      label: "Blur Y",
      type: "input-number",
    },
    {
      $when: "blur == true",
      name: "blurQuality",
      label: "Quality",
      type: "input-number",
    },
    {
      $when: "blur == true",
      name: "blurKernelSize",
      label: "Kernel Size",
      type: "select",
      options: BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS.map((value) => ({
        value,
        label: String(value),
      })),
    },
    {
      $when: "blur == true",
      name: "blurRepeatEdgePixels",
      label: "Repeat Edge Pixels",
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "No" },
        { value: true, label: "Yes" },
      ],
    },
    {
      name: "animationId",
      label: "Animation",
      type: "select",
      clearable: true,
      placeholder: "Select animation",
      options: animationOptions,
    },
  ];

  if (selectedAnimationMode !== "none") {
    formFields.push({
      name: "playbackContinuity",
      label: "Playback",
      type: "segmented-control",
      clearable: false,
      options: ANIMATION_PLAYBACK_CONTINUITY_OPTIONS,
    });
  }

  if (selectedResource?.resourceType === "video") {
    formFields.push({
      name: "loop",
      label: "Loop Video",
      type: "select",
      options: [
        { value: true, label: "Loop" },
        { value: false, label: "Don't Loop" },
      ],
    });
  }

  const form = {
    fields: formFields,
  };

  const defaultValues = {
    background: selectedResource?.fileId || "",
    colorId: state.selectedColorId,
    customTransform: state.customTransformEnabled,
    transformId: state.selectedTransformId,
    opacity: state.selectedOpacity ?? DEFAULT_BACKGROUND_OPACITY,
    blur: state.selectedBlurEnabled,
    blurX: state.selectedBlur.x,
    blurY: state.selectedBlur.y,
    blurQuality: state.selectedBlur.quality,
    blurKernelSize: state.selectedBlur.kernelSize,
    blurRepeatEdgePixels: state.selectedBlur.repeatEdgePixels,
    playbackContinuity: state.selectedAnimationPlaybackContinuity,
    animationId: state.selectedAnimationId,
    loop: state.backgroundLoop ?? false,
  };

  return {
    mode: state.mode,
    tab: state.tab,
    tabs,
    breadcrumb,
    items: flatItems,
    groups: flatGroups,
    tempSelectedResourceId: state.tempSelectedResourceId,
    selectedResource,
    customTransformDetails: createCustomTransformDetails({ state }),
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    backgroundTransformEditor: createBackgroundTransformEditorViewData({
      state,
      props,
    }),
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    dialogueForm: {
      key: [
        selectedResource?.resourceType ?? "none",
        selectedResource?.resourceId ?? "none",
        state.selectedColorId ?? "none",
        state.customTransformEnabled ? "custom-transform" : "preset-transform",
        state.selectedTransformId ?? "none",
        JSON.stringify(state.selectedCustomTransform ?? {}),
        state.customTransformEditorOpen
          ? "custom-transform-editor-open"
          : "custom-transform-editor-closed",
        state.selectedOpacity ?? DEFAULT_BACKGROUND_OPACITY,
        state.selectedBlurEnabled ? "blur" : "no-blur",
        state.selectedBlur.x,
        state.selectedBlur.y,
        state.selectedBlur.quality,
        state.selectedBlur.kernelSize,
        state.selectedBlur.repeatEdgePixels ? "repeat-edge" : "no-repeat-edge",
        state.selectedAnimationPlaybackContinuity ?? "render",
        selectedAnimationMode,
        state.selectedAnimationId ?? "none",
        state.backgroundLoop ? "loop" : "no-loop",
      ].join(":"),
      form,
      defaultValues,
    },
  };
};
