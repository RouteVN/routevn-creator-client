import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { generatePrefixedId } from "../../internal/id.js";
import {
  canLoopAnimationById,
  createAnimationReference,
  getAnimationModeById,
  getAnimationType,
  normalizeAnimationPlaybackContinuity,
  normalizeAnimationPlaybackLoop,
  normalizeAnimationPlaybackSpeed,
} from "../../internal/animationPlayback.js";
import {
  getSpritesheetAnimationPreview,
  toSpritesheetAnimationSelectionValue,
} from "../../internal/spritesheets.js";
import {
  COMMAND_LINE_ITEM_FLIP_OPTIONS,
  COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_SELECT_OPTIONS,
  COMMAND_LINE_ITEM_BLUR_REPEAT_EDGE_OPTIONS,
  COMMAND_LINE_ITEM_BLUR_TOGGLE_OPTIONS,
  DEFAULT_COMMAND_LINE_ITEM_BLUR,
  DEFAULT_COMMAND_LINE_ITEM_OPACITY,
  normalizeCommandLineItemBlur,
  normalizeCommandLineItemBlurEnabled,
  normalizeCommandLineItemBlurWithField,
  normalizeCommandLineItemEffects,
  normalizeCommandLineItemOpacity,
  getCommandLineItemFlipOption,
} from "../../internal/commandLineItemEffects.js";
import {
  createCommandLineShaderAdjustmentControls,
  getCommandLineShaderAdjustment,
  getCommandLineShaderAdjustmentValue,
  orderCommandLineShaderAdjustmentFilters,
  removeCommandLineShaderAdjustmentFilter,
  setCommandLineShaderAdjustmentFilter,
} from "../../internal/commandLineShaderAdjustments.js";
import {
  BACKGROUND_TRANSFORM_FIELDS,
  createActionItemWithInlineTransform,
  formatBackgroundTransformEditorMetric,
  hasInlineTransform,
  normalizeBackgroundTransformEditorTransform,
  removeInlineTransformFields,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineDropdownMenu,
  localizeCommandLineForm,
  localizeCommandLineOptions,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const RESOURCE_TYPES = [
  { type: "image", label: "Images" },
  { type: "spritesheet", label: "Spritesheets" },
  { type: "video", label: "Videos" },
  { type: "layout", label: "Layouts" },
];

const tabs = RESOURCE_TYPES.map(({ type, label }) => ({
  id: type,
  label,
}));

const DEFAULT_VISUAL_LAYER = 50;
const VISUAL_LAYER_OPTIONS = [
  {
    value: 90,
    label: "Foreground",
  },
  {
    value: 70,
    label: "Behind Choice",
  },
  {
    value: DEFAULT_VISUAL_LAYER,
    label: "Behind Dialogue",
  },
  {
    value: 30,
    label: "Behind Character",
  },
  {
    value: 10,
    label: "Behind Background",
  },
];
const VISUAL_LAYER_VALUES = VISUAL_LAYER_OPTIONS.map((option) => option.value);
const VISUAL_LAYER_DISPLAY_OPTIONS = VISUAL_LAYER_OPTIONS.slice().sort(
  (a, b) => b.value - a.value,
);
const TRANSFORM_MODE_OPTIONS = [
  { value: false, label: "Predefined" },
  { value: true, label: "Custom" },
];
const ANIMATION_PLAYBACK_LOOP_OPTIONS = [
  { value: false, label: "Don't Loop" },
  { value: true, label: "Loop" },
];
const ANIMATION_PLAYBACK_CONTINUITY_OPTIONS = [
  { value: "render", label: "Single Line" },
  { value: "persistent", label: "Persistent" },
];

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const getVisualLayer = (visual = {}) => normalizeVisualLayer(visual.layer);

const orderVisualsByLayer = (visuals = []) => {
  const orderedVisuals = [];

  for (const option of VISUAL_LAYER_DISPLAY_OPTIONS) {
    orderedVisuals.push(
      ...visuals.filter((visual) => getVisualLayer(visual) === option.value),
    );
  }

  return orderedVisuals;
};

const syncSelectedVisualIndex = (state, selectedVisual) => {
  if (!selectedVisual) {
    return;
  }

  const nextSelectedIndex = state.selectedVisuals.findIndex(
    (visual) => visual.id === selectedVisual.id,
  );
  state.selectedVisualIndex =
    nextSelectedIndex >= 0 ? nextSelectedIndex : undefined;
};

const normalizeSelectedVisualOrder = (state) => {
  const selectedVisual = state.selectedVisuals[state.selectedVisualIndex];
  state.selectedVisuals = orderVisualsByLayer(state.selectedVisuals);
  syncSelectedVisualIndex(state, selectedVisual);
};

const createVisualDropdownItems = (visualIndex, visuals = []) => {
  const items = [];
  const visual = visuals[visualIndex];
  const groupIndices = visual
    ? visuals.reduce((indices, item, index) => {
        if (getVisualLayer(item) === getVisualLayer(visual)) {
          indices.push(index);
        }
        return indices;
      }, [])
    : [];
  const groupIndex = groupIndices.indexOf(visualIndex);

  if (groupIndex >= 0 && groupIndex < groupIndices.length - 1) {
    items.push({ label: "Move Up", type: "item", value: "move-up" });
  }

  if (groupIndex > 0) {
    items.push({ label: "Move Down", type: "item", value: "move-down" });
  }

  items.push({ label: "Delete", type: "item", value: "delete" });
  return items;
};

const createAddVisualPopover = () => ({
  isOpen: false,
  position: { x: 0, y: 0 },
});

const createAddVisualForm = ({ transformOptions, layerOptions } = {}) => ({
  title: "Add Visual",
  fields: [
    {
      name: "transformId",
      type: "select",
      label: "Transform",
      options: transformOptions,
      clearable: false,
      placeholder: "Select transform",
    },
    {
      name: "layer",
      type: "select",
      label: "Layer",
      options: layerOptions,
      clearable: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Select Resource",
      },
    ],
  },
});

const createVisualFormSlots = (visualIndex) => {
  const prefix = `visual-${visualIndex}`;
  return {
    formSectionId: prefix,
    previewFormSlot: `${prefix}-preview`,
    layerFormSlot: `${prefix}-layer`,
    transformModeFormSlot: `${prefix}-transform-mode`,
    predefinedTransformFormSlot: `${prefix}-predefined-transform`,
    transformSpacerFormSlot: `${prefix}-transform-spacer`,
    customTransformFormSlot: `${prefix}-custom-transform`,
    animationFormSlot: `${prefix}-animation`,
    playbackSpeedFormSlot: `${prefix}-playback-speed`,
    playbackContinuityFormSlot: `${prefix}-playback-continuity`,
    playbackLoopFormSlot: `${prefix}-playback-loop`,
    playbackLoopSpacerFormSlot: `${prefix}-playback-loop-spacer`,
    opacityFormSlot: `${prefix}-opacity`,
    blurToggleFormSlot: `${prefix}-blur-toggle`,
    blurXFormSlot: `${prefix}-blur-x`,
    blurYFormSlot: `${prefix}-blur-y`,
    blurQualityFormSlot: `${prefix}-blur-quality`,
    blurKernelSizeFormSlot: `${prefix}-blur-kernel-size`,
    blurRepeatEdgePixelsFormSlot: `${prefix}-blur-repeat-edge-pixels`,
  };
};

const createVisualsForm = (visuals = []) => ({
  fields: visuals.map((visual) => {
    const fields = [
      {
        type: "row",
        fields: [
          {
            type: "slot",
            slot: visual.previewFormSlot,
            label: "Visuals",
          },
          {
            type: "slot",
            slot: visual.layerFormSlot,
            label: "Layer",
          },
        ],
      },
      {
        type: "row",
        fields: [
          {
            type: "slot",
            slot: visual.transformModeFormSlot,
            label: "Transform",
          },
          {
            type: "slot",
            slot: visual.customTransform
              ? visual.transformSpacerFormSlot
              : visual.predefinedTransformFormSlot,
            label: visual.customTransform ? undefined : "Predefined Transform",
          },
        ],
      },
    ];

    if (visual.customTransform) {
      fields.push({
        type: "slot",
        slot: visual.customTransformFormSlot,
      });
    }

    fields.push({
      type: "slot",
      slot: visual.animationFormSlot,
      label: "Animation",
    });

    if (visual.animationId) {
      fields.push({
        type: "row",
        fields: [
          {
            type: "slot",
            slot: visual.playbackSpeedFormSlot,
            label: "Playback Speed",
          },
          {
            type: "slot",
            slot: visual.playbackContinuityFormSlot,
            label: "Continuity",
          },
        ],
      });
    }

    if (visual.animationId && visual.animationMode === "update") {
      fields.push({
        type: "row",
        fields: [
          {
            type: "slot",
            slot: visual.playbackLoopFormSlot,
            label: "Loop",
          },
          {
            type: "slot",
            slot: visual.playbackLoopSpacerFormSlot,
          },
        ],
      });
    }

    fields.push({
      type: "row",
      fields: [
        {
          type: "slot",
          slot: visual.opacityFormSlot,
          label: "Opacity",
        },
        {
          type: "slot",
          slot: visual.blurToggleFormSlot,
          label: "Blur",
        },
      ],
    });

    if (visual.blurEnabled) {
      fields.push(
        {
          type: "row",
          fields: [
            {
              type: "slot",
              slot: visual.blurXFormSlot,
              label: "Blur X",
            },
            {
              type: "slot",
              slot: visual.blurYFormSlot,
              label: "Blur Y",
            },
          ],
        },
        {
          type: "row",
          fields: [
            {
              type: "slot",
              slot: visual.blurQualityFormSlot,
              label: "Quality",
            },
            {
              type: "slot",
              slot: visual.blurKernelSizeFormSlot,
              label: "Kernel Size",
            },
          ],
        },
        {
          type: "slot",
          slot: visual.blurRepeatEdgePixelsFormSlot,
          label: "Repeat Edge Pixels",
        },
      );
    }

    for (const flipOption of visual.flipOptions) {
      if (!flipOption.enabled) {
        continue;
      }

      fields.push({
        type: "section",
        id: `${visual.formSectionId}-${flipOption.id}`,
        label: flipOption.label,
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [],
      });
    }

    for (const adjustment of visual.shaderAdjustments) {
      if (!adjustment.enabled) {
        continue;
      }

      fields.push({
        type: "section",
        id: `${visual.formSectionId}-${adjustment.id}`,
        label: adjustment.label,
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [
          {
            type: "slot",
            slot: adjustment.formSlot,
          },
        ],
      });
    }

    return {
      type: "section",
      id: visual.formSectionId,
      action:
        visual.flipOptions.every((option) => option.enabled) &&
        visual.shaderAdjustments.every((adjustment) => adjustment.enabled)
          ? undefined
          : {
              id: "add",
              icon: "plus",
              label: "Add option",
            },
      fields,
    };
  }),
});

const createLocalizedVisualsForm = (visuals = [], copy = {}) => {
  const form = localizeCommandLineForm(createVisualsForm(visuals), copy);

  for (const [index, visual] of visuals.entries()) {
    form.fields[index].label = visual.displayName;
  }

  return form;
};

const isHierarchyCollection = (value) =>
  !!value &&
  typeof value === "object" &&
  !!value.items &&
  typeof value.items === "object";

const normalizeResourceCollection = (collection, { defaultType } = {}) => {
  if (isHierarchyCollection(collection)) {
    return {
      items: { ...collection.items },
      tree: Array.isArray(collection.tree)
        ? collection.tree
        : Array.isArray(collection.order)
          ? collection.order
          : [],
    };
  }

  const collectionMap =
    collection && typeof collection === "object" ? collection : {};
  const items = {};
  const ids = [];

  for (const [resourceId, resource] of Object.entries(collectionMap)) {
    if (!resource || typeof resource !== "object") {
      continue;
    }

    const item = {
      id: resourceId,
      ...structuredClone(resource),
    };
    item.type = item.type || defaultType;
    items[resourceId] = item;
    ids.push(resourceId);
  }

  const sortedIds = ids.sort((a, b) => {
    const aTs = items[a]?.createdAt ?? 0;
    const bTs = items[b]?.createdAt ?? 0;
    if (aTs !== bTs) return aTs - bTs;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
  const idSet = new Set(sortedIds);
  const rootParentKey = "__root__";
  const childrenByParent = new Map([[rootParentKey, []]]);

  for (const id of sortedIds) {
    const rawParentId = items[id]?.parentId;
    const parentId =
      typeof rawParentId === "string" &&
      rawParentId.length > 0 &&
      rawParentId !== id &&
      idSet.has(rawParentId)
        ? rawParentId
        : rootParentKey;

    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(id);
  }

  const visited = new Set();
  const buildNodes = (parentId) => {
    const idsForParent = childrenByParent.get(parentId) || [];
    const nodes = [];

    for (const id of idsForParent) {
      if (visited.has(id)) {
        continue;
      }

      visited.add(id);
      const children = buildNodes(id);
      nodes.push(children.length > 0 ? { id, children } : { id });
    }

    return nodes;
  };

  const tree = buildNodes(rootParentKey);
  for (const id of sortedIds) {
    if (visited.has(id)) {
      continue;
    }

    visited.add(id);
    tree.push({ id });
  }

  return { items, tree };
};

const normalizeVisualLayer = (layer) => {
  const parsedLayer = Number(layer);
  return VISUAL_LAYER_VALUES.includes(parsedLayer)
    ? parsedLayer
    : DEFAULT_VISUAL_LAYER;
};

const normalizeSelectedVisual = (visual = {}, animations = {}) => {
  const nextVisual = normalizeCommandLineItemEffects(
    structuredClone(visual ?? {}),
  );
  const selectedAnimationId = nextVisual?.animations?.resourceId;
  const selectedAnimationMode = getAnimationModeById(
    animations,
    selectedAnimationId,
  );

  nextVisual.animationMode =
    nextVisual.animationMode ??
    selectedAnimationMode ??
    (selectedAnimationId ? "update" : "none");
  if (selectedAnimationId) {
    nextVisual.animations = createAnimationReference({
      animationId: selectedAnimationId,
      animations,
      playback: nextVisual.animations?.playback,
      animationMode: nextVisual.animationMode,
    });
  }
  nextVisual.layer = normalizeVisualLayer(nextVisual.layer);
  if (Array.isArray(nextVisual.filters)) {
    nextVisual.filters = orderCommandLineShaderAdjustmentFilters(
      nextVisual.filters,
    );
  }

  return nextVisual;
};

const getCollectionTree = (collection) => {
  if (Array.isArray(collection?.tree) && collection.tree.length > 0) {
    return collection.tree;
  }
  if (Array.isArray(collection?.order) && collection.order.length > 0) {
    return collection.order;
  }

  return Object.keys(collection?.items || {}).map((id) => ({ id }));
};

const isSelectableVisualResource = (resourceType, item) => {
  return resourceType !== "layout" || item?.layoutType === "general";
};

const selectResourceCollection = (state, resourceType) => {
  const collections = {
    image: state.images,
    spritesheet: state.spritesheets,
    video: state.videos,
    layout: state.layouts,
  };

  return collections[resourceType];
};

const getResourceTypeLabel = (resourceType) => {
  const resourceTypeItem = RESOURCE_TYPES.find(
    (item) => item.type === resourceType,
  );
  return resourceTypeItem?.label ?? resourceType;
};

const getActiveResourceType = (state) => {
  return RESOURCE_TYPES.some((item) => item.type === state.tab)
    ? state.tab
    : "image";
};

const resolveResourceItemByType = (
  state,
  { resourceId, resourceType } = {},
) => {
  if (!resourceId || !resourceType) {
    return undefined;
  }

  const collection = selectResourceCollection(state, resourceType);
  const resourceData = collection?.items?.[resourceId];
  if (
    !resourceData ||
    resourceData.type === "folder" ||
    !isSelectableVisualResource(resourceType, resourceData)
  ) {
    return undefined;
  }

  return {
    ...resourceData,
    resourceType,
    previewFileId: resourceData.thumbnailFileId || resourceData.fileId,
  };
};

const resolveResourceItem = (state, { resourceId, resourceType } = {}) => {
  if (!resourceId) {
    return undefined;
  }

  if (resourceType) {
    return resolveResourceItemByType(state, { resourceId, resourceType });
  }

  for (const resourceTypeEntry of RESOURCE_TYPES) {
    const resourceItem = resolveResourceItemByType(state, {
      resourceId,
      resourceType: resourceTypeEntry.type,
    });
    if (resourceItem) {
      return resourceItem;
    }
  }

  return undefined;
};

const prefixTreeNode = (node, resourceType, items) => {
  const item = items[node.id];
  if (
    item?.type !== "folder" &&
    !isSelectableVisualResource(resourceType, item)
  ) {
    return undefined;
  }

  const prefixedNode = { id: `${resourceType}:${node.id}` };
  if (Array.isArray(node.children) && node.children.length > 0) {
    const children = node.children
      .map((child) => prefixTreeNode(child, resourceType, items))
      .filter(Boolean);
    if (children.length > 0) {
      prefixedNode.children = children;
    }
  }
  return prefixedNode;
};

const buildResourceExplorerItems = ({ collection, resourceType } = {}) => {
  const items = {};
  const tree = getCollectionTree(collection)
    .map((node) => prefixTreeNode(node, resourceType, collection.items || {}))
    .filter(Boolean);

  Object.entries(collection.items || {}).forEach(([id, item]) => {
    if (
      item.type !== "folder" &&
      !isSelectableVisualResource(resourceType, item)
    ) {
      return;
    }

    items[`${resourceType}:${id}`] = {
      ...item,
      resourceId: id,
      resourceType,
    };
  });

  return { items, tree };
};

const parseResourceExplorerId = (itemId = "") => {
  const separatorIndex = itemId.indexOf(":");
  if (separatorIndex === -1) {
    return { resourceType: undefined, resourceId: itemId };
  }

  return {
    resourceType: itemId.slice(0, separatorIndex),
    resourceId: itemId.slice(separatorIndex + 1),
  };
};

export const createInitialState = () => ({
  mode: "current",
  tab: "image",
  images: createEmptyCollection(),
  spritesheets: createEmptyCollection(),
  videos: createEmptyCollection(),
  layouts: createEmptyCollection(),
  transforms: createEmptyCollection(),
  animations: createEmptyCollection(),
  /**
   * Array of raw visual objects with the following structure:
   * {
   *   id: string,              // Unique visual ID
   *   resourceId: string,      // Image/spritesheet/video/layout resource ID
   *   resourceType: string,    // image/spritesheet/video/layout
   *   animationName: string,   // Required for spritesheet resources
   *   transformId: string,     // Transform ID
   *   layer: number,           // Required visual render layer
   *   animations: object,      // Optional animation selection with resourceId
   * }
   */
  selectedVisuals: [],
  tempSelectedResourceId: undefined,
  tempSelectedResourceType: undefined,
  tempSelectedAnimationName: undefined,
  pendingVisualTransformId: undefined,
  pendingVisualLayer: undefined,
  selectedVisualIndex: undefined,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  fullSpritesheetPreviewVisible: false,
  fullSpritesheetPreviewFileId: undefined,
  fullSpritesheetPreviewAtlas: undefined,
  fullSpritesheetPreviewAnimation: undefined,
  fullSpritesheetPreviewKey: undefined,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    type: "visual-context",
    visualIndex: null,
    items: [{ label: "Delete", type: "item", value: "delete" }],
  },
  addVisualPopover: createAddVisualPopover(),
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setTab = ({ state }, { tab } = {}) => {
  state.tab = RESOURCE_TYPES.some((item) => item.type === tab) ? tab : "image";
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = normalizeResourceCollection(images, { defaultType: "image" });
};

export const setSpritesheets = ({ state }, { spritesheets } = {}) => {
  state.spritesheets = normalizeResourceCollection(spritesheets, {
    defaultType: "spritesheet",
  });
};

export const setVideos = ({ state }, { videos } = {}) => {
  state.videos = normalizeResourceCollection(videos, { defaultType: "video" });
};

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = normalizeResourceCollection(layouts, {
    defaultType: "layout",
  });
};

export const setTransforms = ({ state }, { transforms } = {}) => {
  state.transforms = transforms;
};

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations;
  state.selectedVisuals = state.selectedVisuals.map((visual) =>
    normalizeSelectedVisual(visual, state.animations),
  );
};

const generateVisualId = () => {
  return generatePrefixedId("visual-");
};

const getTransformItems = (state) =>
  toFlatItems(state.transforms).filter((item) => item.type === "transform");

const getDefaultTransformId = (state) => {
  const transformItems = getTransformItems(state);

  return transformItems.length > 0 ? transformItems[0].id : undefined;
};

const getTransformResourceById = (state, transformId) => {
  if (!transformId) {
    return undefined;
  }

  return getTransformItems(state).find((item) => item.id === transformId);
};

const getSelectedTransformResource = (state, visual = {}) => {
  return getTransformResourceById(
    state,
    visual.transformId ?? getDefaultTransformId(state),
  );
};

const createCustomTransformDetails = (visual = {}) => {
  const transform = normalizeBackgroundTransformEditorTransform(visual);

  return [
    {
      label: "Position",
      value: `${formatBackgroundTransformEditorMetric(transform.x)}, ${formatBackgroundTransformEditorMetric(transform.y)}`,
    },
    {
      label: "Scale",
      value: `${formatBackgroundTransformEditorMetric(transform.scaleX)} x ${formatBackgroundTransformEditorMetric(transform.scaleY)}`,
    },
    {
      label: "Anchor",
      value: `${formatBackgroundTransformEditorMetric(transform.anchorX)}, ${formatBackgroundTransformEditorMetric(transform.anchorY)}`,
    },
    {
      label: "Rotation",
      value: `${formatBackgroundTransformEditorMetric(transform.rotation)}°`,
    },
    {
      label: "Origin",
      value: `${formatBackgroundTransformEditorMetric(transform.originX)}, ${formatBackgroundTransformEditorMetric(transform.originY)}`,
    },
  ];
};

const applyVisualInlineTransform = (visual, transform) => {
  const nextVisual = createActionItemWithInlineTransform(visual, transform, {
    preserveTransformId: true,
  });

  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    visual[field] = nextVisual[field];
  }
};

const clearVisualInlineTransform = (visual) => {
  const nextVisual = removeInlineTransformFields(visual);
  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    delete visual[field];
  }
  if (!visual.transformId) {
    visual.transformId = nextVisual.transformId;
  }
};

export const addVisual = (
  { state },
  { resourceId, resourceType, animationName, transformId, layer } = {},
) => {
  const defaultTransform = getDefaultTransformId(state);
  const visual = {
    id: generateVisualId(),
    resourceId: resourceId,
    transformId: transformId ?? defaultTransform,
    layer: normalizeVisualLayer(layer),
    animationMode: "none",
  };

  if (resourceType) {
    visual.resourceType = resourceType;
  }
  if (resourceType === "spritesheet" && animationName) {
    visual.animationName = animationName;
  }

  state.selectedVisuals.push(visual);
  normalizeSelectedVisualOrder(state);
};

export const removeVisual = ({ state }, { index } = {}) => {
  state.selectedVisuals.splice(index, 1);
};

export const moveVisual = ({ state }, { index, offset } = {}) => {
  const visual = state.selectedVisuals[index];
  const selectedVisual = state.selectedVisuals[state.selectedVisualIndex];
  const normalizedOffset = Math.sign(offset);

  if (!visual || normalizedOffset === 0) {
    return;
  }

  const visualLayer = getVisualLayer(visual);
  const layerVisuals = state.selectedVisuals.filter(
    (item) => getVisualLayer(item) === visualLayer,
  );
  const currentLayerIndex = layerVisuals.findIndex(
    (item) => item.id === visual.id,
  );
  const targetLayerIndex = currentLayerIndex + normalizedOffset;

  if (
    currentLayerIndex < 0 ||
    targetLayerIndex < 0 ||
    targetLayerIndex >= layerVisuals.length
  ) {
    return;
  }

  layerVisuals.splice(currentLayerIndex, 1);
  layerVisuals.splice(targetLayerIndex, 0, visual);

  const visualsByLayer = new Map();
  for (const item of state.selectedVisuals) {
    const layer = getVisualLayer(item);
    if (!visualsByLayer.has(layer)) {
      visualsByLayer.set(layer, []);
    }

    if (layer === visualLayer) {
      continue;
    }

    visualsByLayer.get(layer).push(item);
  }

  visualsByLayer.set(visualLayer, layerVisuals);
  state.selectedVisuals = VISUAL_LAYER_DISPLAY_OPTIONS.flatMap(
    (option) => visualsByLayer.get(option.value) ?? [],
  );
  syncSelectedVisualIndex(state, selectedVisual);
};

export const updateVisualTransform = ({ state }, { index, transform } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  visual.transformId = transform;
  clearVisualInlineTransform(visual);
};

export const updateVisualCustomTransformEnabled = (
  { state },
  { index, enabled } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  const customEnabled = enabled === true || enabled === "true";
  if (!customEnabled) {
    clearVisualInlineTransform(visual);
    visual.transformId = visual.transformId ?? getDefaultTransformId(state);
    return;
  }

  const selectedTransform = getSelectedTransformResource(state, visual);
  applyVisualInlineTransform(visual, {
    ...normalizeBackgroundTransformEditorTransform(selectedTransform),
    ...visual,
  });
};

export const updateVisualCustomTransform = (
  { state },
  { index, transform } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  visual.transformId = visual.transformId ?? getDefaultTransformId(state);
  applyVisualInlineTransform(visual, transform);
};

export const updateVisualAnimation = (
  { state },
  { index, animationId } = {},
) => {
  if (!state.selectedVisuals[index]) {
    return;
  }

  if (!animationId || animationId === "none") {
    state.selectedVisuals[index].animations = undefined;
    state.selectedVisuals[index].animationMode = "none";
    return;
  }

  const selectedAnimationMode = getAnimationModeById(
    state.animations,
    animationId,
  );
  const visual = state.selectedVisuals[index];
  visual.animationMode = selectedAnimationMode ?? "update";
  visual.animations = createAnimationReference({
    animationId,
    animations: state.animations,
    playback: visual.animations?.playback,
    animationMode: visual.animationMode,
  });
};

export const updateVisualAnimationPlaybackSpeed = (
  { state },
  { index, speed } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual?.animations) {
    return;
  }

  visual.animations.playback.speed = normalizeAnimationPlaybackSpeed(speed);
};

export const updateVisualAnimationPlaybackLoop = (
  { state },
  { index, loop } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual?.animations) {
    return;
  }

  const canLoop = canLoopAnimationById(
    state.animations,
    visual.animations.resourceId,
  );
  visual.animations.playback.loop = canLoop
    ? normalizeAnimationPlaybackLoop(loop)
    : false;
};

export const updateVisualAnimationPlaybackContinuity = (
  { state },
  { index, continuity } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual?.animations) {
    return;
  }

  visual.animations.playback.continuity =
    normalizeAnimationPlaybackContinuity(continuity);
};

export const updateVisualLayer = ({ state }, { index, layer } = {}) => {
  if (state.selectedVisuals[index]) {
    state.selectedVisuals[index].layer = normalizeVisualLayer(layer);
    normalizeSelectedVisualOrder(state);
  }
};

export const updateVisualOpacity = ({ state }, { index, opacity } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  const normalizedOpacity = normalizeCommandLineItemOpacity(opacity);
  if (normalizedOpacity === undefined) {
    delete visual.opacity;
    return;
  }

  visual.opacity = normalizedOpacity;
};

export const updateVisualBlurEnabled = ({ state }, { index, enabled } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  if (!normalizeCommandLineItemBlurEnabled(enabled)) {
    visual.blur = null;
    return;
  }

  visual.blur = normalizeCommandLineItemBlur(
    visual.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
  );
};

export const updateVisualBlurField = (
  { state },
  { index, fieldName, value } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  visual.blur = normalizeCommandLineItemBlurWithField({
    blur: visual.blur,
    fieldName,
    value,
  });
};

export const showVisualFlipOption = ({ state }, { index, optionId } = {}) => {
  const visual = state.selectedVisuals[index];
  const option = getCommandLineItemFlipOption(optionId);
  if (!visual || !option) {
    return;
  }

  visual[option.fieldName] = true;
};

export const removeVisualFlipOption = ({ state }, { index, optionId } = {}) => {
  const visual = state.selectedVisuals[index];
  const option = getCommandLineItemFlipOption(optionId);
  if (!visual || !option) {
    return;
  }

  delete visual[option.fieldName];
};

export const selectVisualFlipOptionEnabled = (
  { state },
  { index, optionId } = {},
) => {
  const option = getCommandLineItemFlipOption(optionId);
  return (
    !!option && state.selectedVisuals[index]?.[option.fieldName] !== undefined
  );
};

export const updateVisualShaderAdjustment = (
  { state },
  { index, adjustmentId, value } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual || !getCommandLineShaderAdjustment(adjustmentId)) {
    return;
  }

  visual.filters = setCommandLineShaderAdjustmentFilter(
    visual.filters,
    adjustmentId,
    value,
  );
};

export const showVisualShaderAdjustmentOption = (
  { state },
  { index, adjustmentId } = {},
) => {
  const visual = state.selectedVisuals[index];
  const adjustment = getCommandLineShaderAdjustment(adjustmentId);
  if (!visual || !adjustment) {
    return;
  }

  const value =
    getCommandLineShaderAdjustmentValue(visual.filters, adjustmentId) ??
    adjustment.defaultValue;
  visual.filters = setCommandLineShaderAdjustmentFilter(
    visual.filters,
    adjustmentId,
    value,
  );
};

export const removeVisualShaderAdjustmentOption = (
  { state },
  { index, adjustmentId } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual || !getCommandLineShaderAdjustment(adjustmentId)) {
    return;
  }

  visual.filters = removeCommandLineShaderAdjustmentFilter(
    visual.filters,
    adjustmentId,
  );
};

export const selectVisualShaderAdjustmentOptionEnabled = (
  { state },
  { index, adjustmentId } = {},
) => {
  return (
    getCommandLineShaderAdjustmentValue(
      state.selectedVisuals[index]?.filters,
      adjustmentId,
    ) !== undefined
  );
};

export const updateVisualResource = (
  { state },
  { index, resourceId, resourceType, animationName } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (visual) {
    visual.resourceId = resourceId;
    visual.resourceType = resourceType;
    if (resourceType === "spritesheet" && animationName) {
      visual.animationName = animationName;
    } else {
      delete visual.animationName;
    }
  }
};

export const clearVisuals = ({ state }, _payload = {}) => {
  state.selectedVisuals = [];
};

export const setTempSelectedResourceId = (
  { state },
  { resourceId, resourceType, animationName } = {},
) => {
  state.tempSelectedResourceId = resourceId;
  state.tempSelectedResourceType = resourceId ? resourceType : undefined;
  state.tempSelectedAnimationName =
    resourceId && resourceType === "spritesheet" ? animationName : undefined;
};

export const setPendingVisualLayer = ({ state }, { layer } = {}) => {
  state.pendingVisualLayer = normalizeVisualLayer(layer);
};

export const clearPendingVisualLayer = ({ state }, _payload = {}) => {
  state.pendingVisualLayer = undefined;
};

export const setPendingVisualTransformId = (
  { state },
  { transformId } = {},
) => {
  state.pendingVisualTransformId = transformId;
};

export const clearPendingVisualTransformId = ({ state }, _payload = {}) => {
  state.pendingVisualTransformId = undefined;
};

export const clearPendingVisualConfig = ({ state }, _payload = {}) => {
  state.pendingVisualLayer = undefined;
  state.pendingVisualTransformId = undefined;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const showFullImagePreview = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = fileId;
  state.fullSpritesheetPreviewVisible = false;
};

export const showFullSpritesheetPreview = (
  { state },
  { resourceId, animationName } = {},
) => {
  const preview = getSpritesheetAnimationPreview(
    state.spritesheets,
    resourceId,
    animationName,
  );
  if (!preview.fileId || !preview.atlas || !preview.animation) {
    return;
  }

  const selectionValue = toSpritesheetAnimationSelectionValue(
    resourceId,
    animationName,
  );
  state.fullImagePreviewVisible = false;
  state.fullSpritesheetPreviewVisible = true;
  state.fullSpritesheetPreviewFileId = preview.fileId;
  state.fullSpritesheetPreviewAtlas = preview.atlas;
  state.fullSpritesheetPreviewAnimation = preview.animation;
  state.fullSpritesheetPreviewKey = `${selectionValue}:${preview.fileId}`;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
  state.fullSpritesheetPreviewVisible = false;
  state.fullSpritesheetPreviewFileId = undefined;
  state.fullSpritesheetPreviewAtlas = undefined;
  state.fullSpritesheetPreviewAnimation = undefined;
  state.fullSpritesheetPreviewKey = undefined;
};

export const setSelectedVisualIndex = ({ state }, { index } = {}) => {
  state.selectedVisualIndex = index;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const selectTempSelectedResourceType = ({ state }) => {
  return state.tempSelectedResourceType;
};

export const selectTempSelectedAnimationName = ({ state }) => {
  return state.tempSelectedAnimationName;
};

export const selectPendingVisualLayer = ({ state }) => {
  return state.pendingVisualLayer ?? DEFAULT_VISUAL_LAYER;
};

export const selectPendingVisualTransformId = ({ state }) => {
  return state.pendingVisualTransformId ?? getDefaultTransformId(state);
};

export const showDropdownMenu = ({ state }, { position, visualIndex } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position ?? { x: 0, y: 0 };
  state.dropdownMenu.type = "visual-context";
  state.dropdownMenu.visualIndex = visualIndex;
  state.dropdownMenu.items = createVisualDropdownItems(
    visualIndex,
    state.selectedVisuals,
  );
};

export const openAddVisualPopover = ({ state }, { position } = {}) => {
  state.addVisualPopover.isOpen = true;
  state.addVisualPopover.position = position ?? { x: 0, y: 0 };
  state.pendingVisualTransformId =
    state.pendingVisualTransformId ?? getDefaultTransformId(state);
  state.pendingVisualLayer = state.pendingVisualLayer ?? DEFAULT_VISUAL_LAYER;
};

export const hideAddVisualPopover = ({ state }, _payload = {}) => {
  state.addVisualPopover = createAddVisualPopover();
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.visualIndex = null;
};

export const selectDropdownMenuType = ({ state }) => {
  return state.dropdownMenu.type;
};

export const selectDropdownMenuVisualIndex = ({ state }) => {
  return state.dropdownMenu.visualIndex;
};

export const selectSelectedVisuals = ({ state }) => {
  return state.selectedVisuals;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectTab = ({ state }) => {
  return getActiveResourceType(state);
};

export const selectSelectedVisualIndex = ({ state }) => {
  return state.selectedVisualIndex;
};

export const selectDefaultTransformId = ({ state }) => {
  return getDefaultTransformId(state);
};

export const selectDefaultVisualLayer = () => {
  return DEFAULT_VISUAL_LAYER;
};

export const selectResourceExplorerTarget = (_deps, { itemId } = {}) => {
  return parseResourceExplorerId(itemId);
};

export const setExistingVisuals = ({ state }, { visuals } = {}) => {
  state.selectedVisuals = (Array.isArray(visuals) ? visuals : []).map(
    (visual) => {
      const nextVisual = normalizeSelectedVisual(visual, state.animations);
      if (!nextVisual.resourceType) {
        const resource = resolveResourceItem(state, {
          resourceId: nextVisual.resourceId,
        });
        nextVisual.resourceType = resource?.resourceType;
      }
      return nextVisual;
    },
  );
  normalizeSelectedVisualOrder(state);
};

export const selectResourceItemById = (
  { state },
  { resourceId, resourceType } = {},
) => {
  return resolveResourceItem(state, { resourceId, resourceType });
};

export const selectVisualsWithRepositoryData = ({ state }) => {
  if (!state.selectedVisuals || !Array.isArray(state.selectedVisuals)) {
    return [];
  }

  return state.selectedVisuals.map((visual) => {
    const resource = resolveResourceItem(state, {
      resourceId: visual.resourceId,
      resourceType: visual.resourceType,
    });
    const spritesheetPreview =
      resource?.resourceType === "spritesheet"
        ? getSpritesheetAnimationPreview(
            state.spritesheets,
            visual.resourceId,
            visual.animationName,
          )
        : {};
    const spritesheetSelectionValue = toSpritesheetAnimationSelectionValue(
      visual.resourceId,
      visual.animationName,
    );
    const resourceName = resource?.name ?? "Unknown Resource";

    return {
      ...visual,
      resource,
      resourceType: resource?.resourceType ?? visual.resourceType,
      displayName:
        resource?.resourceType === "spritesheet" && visual.animationName
          ? `${resourceName} / ${visual.animationName}`
          : resourceName,
      fileId: resource?.previewFileId,
      spritesheetFileId: spritesheetPreview.fileId,
      spritesheetAtlas: spritesheetPreview.atlas,
      spritesheetAnimation: spritesheetPreview.animation,
      spritesheetPreviewKey: spritesheetSelectionValue
        ? `${spritesheetSelectionValue}:${spritesheetPreview.fileId ?? ""}`
        : undefined,
    };
  });
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const activeResourceType = getActiveResourceType(state);
  const activeResourceCollection =
    selectResourceCollection(state, activeResourceType) ??
    createEmptyCollection();
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const decorateResourceChild = (child, resourceType) => {
    const isSelected =
      child.id === state.tempSelectedResourceId &&
      resourceType === state.tempSelectedResourceType;
    return {
      ...child,
      resourceType,
      resourceTypeLabel: localizeCommandLineText(
        resourceType === "image"
          ? "Image"
          : resourceType === "video"
            ? "Video"
            : resourceType === "spritesheet"
              ? "Spritesheet"
              : "Layout",
        copy,
      ),
      previewFileId: child.thumbnailFileId || child.fileId,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
    };
  };
  const buildResourceGroups = ({ collection, resourceType, childFilter }) => {
    const groups = toFlatGroups(collection);
    const groupedChildIds = new Set(
      groups.flatMap((group) => group.children.map((child) => child.id)),
    );
    const rootChildren = toFlatItems(collection)
      .filter((item) => item.type !== "folder")
      .filter((item) => !groupedChildIds.has(item.id))
      .filter(childFilter)
      .filter(matchesSearch)
      .map((child) => decorateResourceChild(child, resourceType));

    const rootGroup =
      rootChildren.length > 0
        ? [
            {
              id: `${resourceType}:root`,
              resourceType,
              groupId: `${resourceType}:root`,
              fullLabel: localizeCommandLineText(
                getResourceTypeLabel(resourceType),
                copy,
              ),
              children: rootChildren,
              hasChildren: true,
              shouldDisplay: true,
            },
          ]
        : [];

    return [
      ...rootGroup,
      ...groups
        .map((group) => {
          const children = group.children
            .filter(childFilter)
            .filter(matchesSearch)
            .map((child) => decorateResourceChild(child, resourceType));

          return {
            ...group,
            resourceType,
            groupId: `${resourceType}:${group.id}`,
            children,
            hasChildren: children.length > 0,
            shouldDisplay: !searchQuery || children.length > 0,
          };
        })
        .filter((group) => group.shouldDisplay),
    ];
  };

  const activeChildFilter =
    activeResourceType === "layout"
      ? (child) => child.layoutType === "general"
      : () => true;
  const resourceGroups = buildResourceGroups({
    collection: activeResourceCollection,
    resourceType: activeResourceType,
    childFilter: activeChildFilter,
  });
  const resourceItems = toFlatItems(
    buildResourceExplorerItems({
      collection: activeResourceCollection,
      resourceType: activeResourceType,
    }),
  ).filter((item) => item.type === "folder");

  // Get transform options
  const transformItems = getTransformItems(state);
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));
  const animationItems = toFlatItems(state.animations).filter(
    (item) => item.type === "animation",
  );
  const animationOptions = animationItems.map((item) => ({
    value: item.id,
    label: item.name,
    suffixText:
      getAnimationType(item) === "transition"
        ? localizeCommandLineText("Transition", copy)
        : localizeCommandLineText("Update", copy),
  }));

  // Get enriched visual data
  const enrichedVisuals = selectVisualsWithRepositoryData({ state });
  const processedSelectedVisuals = enrichedVisuals.map((visual) => ({
    ...visual,
    displayName:
      visual.displayName === "Unknown Resource"
        ? localizeCommandLineText("Unknown Resource", copy)
        : visual.displayName ||
          localizeCommandLineText("Unknown Resource", copy),
    animationMode:
      visual.animationMode ??
      getAnimationModeById(state.animations, visual.animations?.resourceId) ??
      "none",
  }));

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "resource-select") {
    breadcrumb.push({
      id: "current",
      label: "Visuals",
      click: true,
    });
    breadcrumb.push({
      label: "Select Resource",
    });
  } else {
    breadcrumb.push({
      label: "Visuals",
    });
  }

  const visualControls = processedSelectedVisuals.map((visual, visualIndex) => {
    const animationCanLoop = canLoopAnimationById(
      state.animations,
      visual.animations?.resourceId,
    );

    return {
      ...visual,
      visualIndex,
      transformId:
        visual.transformId ||
        (transformOptions.length > 0 ? transformOptions[0].value : undefined),
      customTransform: hasInlineTransform(visual),
      customTransformDetails: createCustomTransformDetails(visual).map(
        (item) => ({
          ...item,
          label: localizeCommandLineText(item.label, copy),
        }),
      ),
      animationId: visual.animations?.resourceId,
      animationPlaybackSpeed: normalizeAnimationPlaybackSpeed(
        visual.animations?.playback?.speed,
      ),
      animationPlaybackLoop: normalizeAnimationPlaybackLoop(
        visual.animations?.playback?.loop,
      ),
      animationPlaybackContinuity: normalizeAnimationPlaybackContinuity(
        visual.animations?.playback?.continuity,
      ),
      animationCanLoop,
      animationLoopDisabled: !animationCanLoop,
      layer: normalizeVisualLayer(visual.layer),
      opacity: visual.opacity ?? DEFAULT_COMMAND_LINE_ITEM_OPACITY,
      blurEnabled: Boolean(visual.blur),
      blur: normalizeCommandLineItemBlur(
        visual.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
      ),
      flipOptions: COMMAND_LINE_ITEM_FLIP_OPTIONS.map((option) => ({
        ...option,
        enabled: visual[option.fieldName] !== undefined,
      })),
      shaderAdjustments: createCommandLineShaderAdjustmentControls(
        visual.filters,
      ),
    };
  });
  const visualGroups = VISUAL_LAYER_DISPLAY_OPTIONS.map((option) => {
    const visuals = visualControls
      .filter((visual) => visual.layer === option.value)
      .slice()
      .reverse();

    return {
      id: `layer-${option.value}`,
      label: localizeCommandLineText(option.label, copy),
      layer: option.value,
      visuals,
    };
  })
    .filter((group) => group.visuals.length > 0)
    .map((group, groupIndex) => ({
      ...group,
      visuals: group.visuals.map((visual, visualIndex) => {
        const formSlots = createVisualFormSlots(visual.visualIndex);

        return {
          ...visual,
          controlId: `${groupIndex}x${visualIndex}`,
          ...formSlots,
          shaderAdjustments: visual.shaderAdjustments.map((adjustment) => ({
            ...adjustment,
            formSlot: `${formSlots.formSectionId}-${adjustment.id}`,
          })),
        };
      }),
    }));

  const defaultValues = {
    visualGroups,
    visuals: visualGroups.flatMap((group) => group.visuals),
    transformOptions,
    animationOptions,
    animationPlaybackLoopOptions: localizeCommandLineOptions(
      ANIMATION_PLAYBACK_LOOP_OPTIONS,
      copy,
    ),
    animationPlaybackContinuityOptions: localizeCommandLineOptions(
      ANIMATION_PLAYBACK_CONTINUITY_OPTIONS,
      copy,
    ),
    layerOptions: localizeCommandLineOptions(VISUAL_LAYER_OPTIONS, copy),
    transformModeOptions: localizeCommandLineOptions(
      TRANSFORM_MODE_OPTIONS,
      copy,
    ),
    blurToggleOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_TOGGLE_OPTIONS,
      copy,
    ),
    blurKernelSizeOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_SELECT_OPTIONS,
      copy,
    ),
    blurRepeatEdgeOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_REPEAT_EDGE_OPTIONS,
      copy,
    ),
  };
  const addVisualDefaultValues = {
    transformId: state.pendingVisualTransformId ?? getDefaultTransformId(state),
    layer: state.pendingVisualLayer ?? DEFAULT_VISUAL_LAYER,
  };

  return {
    mode: state.mode,
    tab: activeResourceType,
    tabs: localizeCommandLineOptions(tabs, copy),
    resourceItems,
    resourceGroups,
    tempSelectedSpritesheetValue: toSpritesheetAnimationSelectionValue(
      state.tempSelectedResourceId,
      state.tempSelectedAnimationName,
    ),
    selectedVisuals: processedSelectedVisuals,
    transformOptions,
    animationOptions,
    layerOptions: localizeCommandLineOptions(VISUAL_LAYER_OPTIONS, copy),
    searchQuery: state.searchQuery,
    searchPlaceholder: localizeCommandLineText("Search...", copy),
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    fullSpritesheetPreviewVisible: state.fullSpritesheetPreviewVisible,
    fullSpritesheetPreviewFileId: state.fullSpritesheetPreviewFileId,
    fullSpritesheetPreviewAtlas: state.fullSpritesheetPreviewAtlas,
    fullSpritesheetPreviewAnimation: state.fullSpritesheetPreviewAnimation,
    fullSpritesheetPreviewKey: state.fullSpritesheetPreviewKey,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: createLocalizedVisualsForm(defaultValues.visuals, copy),
    formKey:
      defaultValues.visuals
        .map((visual) =>
          [
            visual.visualIndex,
            visual.id,
            visual.displayName,
            visual.layer,
            visual.customTransform ? "custom-transform" : "preset-transform",
            visual.animationId ?? "no-animation",
            visual.animationMode,
            visual.blurEnabled ? "blur" : "no-blur",
            ...visual.flipOptions
              .filter((option) => option.enabled)
              .map((option) => option.id),
            ...visual.shaderAdjustments
              .filter((adjustment) => adjustment.enabled)
              .map((adjustment) => adjustment.id),
          ].join(":"),
        )
        .join("|") || "no-visuals",
    defaultValues,
    dropdownMenu: localizeCommandLineDropdownMenu(state.dropdownMenu, copy),
    addVisualPopover: {
      ...state.addVisualPopover,
      key: state.addVisualPopover.isOpen
        ? `${addVisualDefaultValues.transformId ?? ""}-${addVisualDefaultValues.layer}`
        : "closed",
    },
    addVisualForm: localizeCommandLineForm(
      createAddVisualForm({
        transformOptions,
        layerOptions: localizeCommandLineOptions(VISUAL_LAYER_OPTIONS, copy),
      }),
      copy,
    ),
    addVisualDefaultValues,
    noThumbnailLabel: localizeCommandLineText("No thumbnail", copy),
    noResourceLabel: localizeCommandLineText("No Resource", copy),
    animationPlaybackLoopDisabledDescription: localizeCommandLineText(
      "loopingRequiresKeyframesDescription",
      copy,
    ),
    selectAnimationPlaceholder: localizeCommandLineText(
      "Select animation",
      copy,
    ),
    addVisualButtonLabel: localizeCommandLineText("+ Add Visual", copy),
    submitButtonLabel: localizeCommandLineText("Submit", copy),
    selectButtonLabel: localizeCommandLineText("Select", copy),
    transformEditorTitle: localizeCommandLineText("Transform", copy),
  };
};
