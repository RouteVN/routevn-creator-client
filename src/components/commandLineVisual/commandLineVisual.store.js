import { toFlatItems } from "../../internal/project/tree.js";
import { createCommandLineResourceSelectorLayout } from "../../internal/ui/sceneEditor/commandLineResourceSelectorLayout.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";
import {
  countVisualLayoutElements,
  createEmptyVisualLayout,
  getDefaultVisualLayoutTransform,
  getVisualLayoutMedia,
  isLinkedLayoutVisualItem,
  toCustomLayoutVisualItem,
  toLayoutVisualItem,
} from "../../internal/project/layout.js";
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
  DEFAULT_COMMAND_LINE_ITEM_BLUR,
  DEFAULT_COMMAND_LINE_ITEM_OPACITY,
  normalizeCommandLineItemBlur,
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
  formatBackgroundTransformEditorPair,
  formatBackgroundTransformEditorRotation,
  hasInlineTransform,
  normalizeBackgroundTransformEditorTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineDropdownMenu,
  localizeCommandLineForm,
  localizeCommandLineOptions,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

// The resources a visual can show.
const VISUAL_RESOURCE_TYPES = [
  "image",
  "spritesheet",
  "video",
  "layout",
  "particle",
];

// The Layout choice of a visual whose layout is its own. Every other choice
// is the id of a project layout, which ids of this form never are.
const CUSTOM_LAYOUT_VALUE = "custom";

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

// Store actions receive Immer drafts, which structuredClone cannot copy.
// Visual items are plain JSON, so a JSON round trip copies them.
const toPlainData = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const cloneVisuals = toPlainData;

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

  // Move Layer opens the list of layers, front layer first. The layer the
  // visual is on cannot be chosen.
  if (visual) {
    items.push({
      label: "Move Layer",
      type: "item",
      value: "move-layer",
      items: VISUAL_LAYER_DISPLAY_OPTIONS.map((option) => ({
        label: option.label,
        type: "item",
        value: "move-to-layer",
        layer: option.value,
        disabled: option.value === getVisualLayer(visual),
      })),
    });
  }

  items.push({ label: "Delete", type: "item", value: "delete" });
  return items;
};

// The layout gallery, opened from the picture of a visual that shows a
// project layout: the visual it chooses for and the layout picked in it.
const createLayoutSelect = () => ({
  visualId: undefined,
  layoutId: undefined,
});

const createAddVisualPopover = () => ({
  isOpen: false,
  position: { x: 0, y: 0 },
});

// The two kinds of visual: one with a layout of its own, and one that shows
// one of the project's layouts.
const EXISTING_LAYOUT_VALUE = "existing";
const VISUAL_LAYOUT_TYPE_OPTIONS = [
  { value: CUSTOM_LAYOUT_VALUE, label: "Custom Layout" },
  { value: EXISTING_LAYOUT_VALUE, label: "Existing Layout" },
];

// Asked before a visual is added: which kind it is and the layer it goes on.
const createAddVisualForm = ({ layoutOptions, layerOptions }) => ({
  title: "Add Visual",
  fields: [
    {
      name: "layoutType",
      type: "segmented-control",
      label: "Layout",
      clearable: false,
      options: VISUAL_LAYOUT_TYPE_OPTIONS,
    },
    {
      $when: 'layoutType == "existing"',
      name: "layoutId",
      type: "select",
      label: "Existing Layout",
      options: layoutOptions,
      clearable: false,
      required: true,
      placeholder: "Select layout",
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
        label: "Continue",
      },
    ],
  },
});

const createVisualFormSlots = (visualIndex) => {
  const prefix = `visual-${visualIndex}`;
  return {
    formSectionId: prefix,
    previewFormSlot: `${prefix}-preview`,
    transformModeFormSlot: `${prefix}-transform-mode`,
    predefinedTransformFormSlot: `${prefix}-predefined-transform`,
    layoutTypeFormSlot: `${prefix}-layout-type`,
    layoutSpacerFormSlot: `${prefix}-layout-spacer`,
    transformSpacerFormSlot: `${prefix}-transform-spacer`,
    customTransformFormSlot: `${prefix}-custom-transform`,
    animationFormSlot: `${prefix}-animation`,
    animationSpacerFormSlot: `${prefix}-animation-spacer`,
    playbackSpeedFormSlot: `${prefix}-playback-speed`,
    playbackContinuityFormSlot: `${prefix}-playback-continuity`,
    playbackLoopFormSlot: `${prefix}-playback-loop`,
    playbackLoopSpacerFormSlot: `${prefix}-playback-loop-spacer`,
    opacityFormSlot: `${prefix}-opacity`,
    blurXFormSlot: `${prefix}-blur-x`,
    blurYFormSlot: `${prefix}-blur-y`,
    blurQualityFormSlot: `${prefix}-blur-quality`,
    blurKernelSizeFormSlot: `${prefix}-blur-kernel-size`,
    blurRepeatEdgePixelsFormSlot: `${prefix}-blur-repeat-edge-pixels`,
  };
};

const createVisualsForm = (visuals = []) => ({
  fields: visuals.map((visual) => {
    // The layer is not edited here: the list shows a visual under its layer,
    // and Move Layer in its menu changes it.
    const fields = [
      {
        type: "row",
        fields: [
          {
            type: "slot",
            slot: visual.layoutTypeFormSlot,
            label: "Layout Type",
          },
          {
            type: "slot",
            slot: visual.layoutSpacerFormSlot,
          },
        ],
      },
      {
        type: "slot",
        slot: visual.previewFormSlot,
        label: "Layout",
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
      type: "row",
      fields: [
        {
          type: "slot",
          slot: visual.animationFormSlot,
          label: "Animation",
        },
        {
          type: "slot",
          slot: visual.animationSpacerFormSlot,
        },
      ],
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

    if (visual.opacityEnabled) {
      fields.push({
        type: "section",
        id: `${visual.formSectionId}-opacity`,
        label: "Opacity",
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [
          {
            type: "slot",
            slot: visual.opacityFormSlot,
          },
        ],
      });
    }

    if (visual.blurEnabled) {
      fields.push({
        type: "section",
        id: `${visual.formSectionId}-blur`,
        label: "Blur",
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [
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
        ],
      });
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
        visual.opacityEnabled &&
        visual.blurEnabled &&
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

// The Edit Visual page has no title: its section is not named.
const createLocalizedVisualsForm = (visuals = [], copy = {}) =>
  localizeCommandLineForm(createVisualsForm(visuals), copy);

// Read-only rows for the visual list. Editing happens in the edit view. The
// list shows a row under its layer's heading, so a row does not name its layer.
const createVisualListItems = (
  { visuals, transformOptions, animationOptions, transformModeOptions },
  copy = {},
) => {
  const findLabel = (options, value) =>
    options.find((option) => option.value === value)?.label;
  const customTransformLabel = findLabel(transformModeOptions, true);

  return visuals.map((visual, listIndex) => {
    const details = [
      {
        label: localizeCommandLineText("Layout", copy),
        value: visual.isCustomLayout
          ? localizeCommandLineText("Custom Layout", copy)
          : visual.layoutName,
      },
      {
        label: localizeCommandLineText("Transform", copy),
        value: visual.customTransform
          ? customTransformLabel
          : (findLabel(transformOptions, visual.transformId) ??
            localizeCommandLineText("Screen Center", copy)),
      },
    ];
    if (visual.animationId) {
      details.push({
        label: localizeCommandLineText("Animation", copy),
        value: findLabel(animationOptions, visual.animationId),
      });
    }

    const effects = [];
    if (visual.opacityEnabled) {
      effects.push(localizeCommandLineText("Opacity", copy));
    }
    if (visual.blurEnabled) {
      effects.push(localizeCommandLineText("Blur", copy));
    }
    for (const option of visual.flipOptions) {
      if (option.enabled) {
        effects.push(localizeCommandLineText(option.label, copy));
      }
    }
    for (const adjustment of visual.shaderAdjustments) {
      if (adjustment.enabled) {
        effects.push(localizeCommandLineText(adjustment.label, copy));
      }
    }

    return {
      ...visual,
      listIndex,
      details: details.filter((detail) => detail.value),
      effects,
    };
  });
};

// The list's rows under their layers, front layer first. A layer without a
// visual is left out.
const createVisualListGroups = (visualGroups, visualListItems) =>
  visualGroups.map((group) => ({
    id: group.id,
    label: group.label,
    visuals: visualListItems.filter((visual) => visual.layer === group.layer),
  }));

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

const isSelectableVisualResource = (resourceType, item) => {
  return resourceType !== "layout" || item?.layoutType === "general";
};

const selectResourceCollection = (state, resourceType) => {
  const collections = {
    image: state.images,
    spritesheet: state.spritesheets,
    video: state.videos,
    layout: state.layouts,
    particle: state.particles,
  };

  return collections[resourceType];
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

  for (const visualResourceType of VISUAL_RESOURCE_TYPES) {
    const resourceItem = resolveResourceItemByType(state, {
      resourceId,
      resourceType: visualResourceType,
    });
    if (resourceItem) {
      return resourceItem;
    }
  }

  return undefined;
};

export const createInitialState = () => ({
  mode: "current",
  images: createEmptyCollection(),
  spritesheets: createEmptyCollection(),
  videos: createEmptyCollection(),
  layouts: createEmptyCollection(),
  particles: createEmptyCollection(),
  transforms: createEmptyCollection(),
  animations: createEmptyCollection(),
  // The project's screen size, which a visual without a transform is
  // centered on.
  resolution: DEFAULT_PROJECT_RESOLUTION,
  // Whether a visual saved before visuals were layouts was opened as one.
  hasConvertedVisuals: false,
  // The custom layout of each visual switched to a project layout, by visual
  // id, so that choosing Custom Layout again brings it back.
  customLayoutsByVisualId: {},
  addVisualPopover: createAddVisualPopover(),
  layoutSelect: createLayoutSelect(),
  // The visual switched to Existing Layout in the edit view that has no
  // project layout chosen yet. Until one is chosen it keeps its custom layout.
  existingLayoutPendingVisualId: undefined,
  /**
   * Array of raw visual objects with the following structure:
   * {
   *   id: string,              // Unique visual ID
   *   resourceId: string,      // Image/spritesheet/video/layout/particle resource ID
   *   resourceType: string,    // image/spritesheet/video/layout/particle
   *   animationName: string,   // Required for spritesheet resources
   *   transformId: string,     // Transform ID
   *   layer: number,           // Required visual render layer
   *   animations: object,      // Optional animation selection with resourceId
   * }
   */
  selectedVisuals: [],
  selectedVisualIndex: undefined,
  // The visual open in the edit view, and the visuals as they were before
  // it opened, so that Cancel can put them back.
  editingVisualId: undefined,
  editingVisualsSnapshot: undefined,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    type: "visual-context",
    visualIndex: null,
    items: [{ label: "Delete", type: "item", value: "delete" }],
  },
});

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

export const setParticles = ({ state }, { particles } = {}) => {
  state.particles = normalizeResourceCollection(particles, {
    defaultType: "particle",
  });
};

export const setTransforms = ({ state }, { transforms } = {}) => {
  state.transforms = transforms;
};

export const setResolution = ({ state }, { resolution } = {}) => {
  state.resolution = resolution ?? DEFAULT_PROJECT_RESOLUTION;
};

export const setHasConvertedVisuals = ({ state }, { converted } = {}) => {
  state.hasConvertedVisuals = converted;
};

export const selectHasConvertedVisuals = ({ state }) =>
  state.hasConvertedVisuals;

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations;
  state.selectedVisuals = state.selectedVisuals.map((visual) =>
    normalizeSelectedVisual(visual, state.animations),
  );
};

const getTransformItems = (state) =>
  toFlatItems(state.transforms).filter((item) => item.type === "transform");

const getTransformResourceById = (state, transformId) => {
  if (!transformId) {
    return undefined;
  }

  return getTransformItems(state).find((item) => item.id === transformId);
};

// The transform a visual is drawn with: its predefined transform, or without
// one, centered on the screen.
const getVisualBaseTransform = (state, visual = {}) =>
  getTransformResourceById(state, visual.transformId) ??
  getDefaultVisualLayoutTransform(state.resolution);

const createCustomTransformDetails = (visual = {}, { copy, dateTime } = {}) => {
  const transform = normalizeBackgroundTransformEditorTransform(visual);
  const formatOptions = { copy, dateTime };

  return [
    {
      label: "Position",
      value: formatBackgroundTransformEditorPair(
        "{x}, {y}",
        [transform.x, transform.y],
        formatOptions,
      ),
    },
    {
      label: "Scale",
      value: formatBackgroundTransformEditorPair(
        "{x} x {y}",
        [transform.scaleX, transform.scaleY],
        formatOptions,
      ),
    },
    {
      label: "Anchor",
      value: formatBackgroundTransformEditorPair(
        "{x}, {y}",
        [transform.anchorX, transform.anchorY],
        formatOptions,
      ),
    },
    {
      label: "Rotation",
      value: formatBackgroundTransformEditorRotation(
        transform.rotation,
        dateTime,
      ),
    },
    {
      label: "Origin",
      value: formatBackgroundTransformEditorPair(
        "{x}, {y}",
        [transform.originX, transform.originY],
        formatOptions,
      ),
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
  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    delete visual[field];
  }
};

// A new visual is an empty layout on the screen, with no transform: its
// elements are placed in the layout.
// Opens the layout gallery for a visual, with the layout it shows picked.
export const openLayoutSelect = ({ state }, { visualId } = {}) => {
  const visual = state.selectedVisuals.find((item) => item.id === visualId);
  if (!visual) {
    return;
  }

  state.layoutSelect.visualId = visualId;
  state.layoutSelect.layoutId = isLinkedLayoutVisualItem(
    visual,
    selectVisualLayoutResources(state),
  )
    ? visual.resourceId
    : undefined;
  state.mode = "layout-select";
};

export const setLayoutSelectLayoutId = ({ state }, { layoutId } = {}) => {
  state.layoutSelect.layoutId = layoutId;
};

// Back to the visual's edit view, with its layout as it was.
export const closeLayoutSelect = ({ state }, _payload = {}) => {
  state.layoutSelect = createLayoutSelect();
  state.mode = "edit";
};

// Select: the visual shows the picked layout. With none picked it stays as it
// was.
export const confirmLayoutSelect = ({ state }, _payload = {}) => {
  const { visualId, layoutId } = state.layoutSelect;
  const index = state.selectedVisuals.findIndex(
    (visual) => visual.id === visualId,
  );
  if (index !== -1 && layoutId) {
    updateVisualLayout({ state }, { index, layoutId });
  }
  closeLayoutSelect({ state });
};

export const openAddVisualPopover = ({ state }, { position } = {}) => {
  state.addVisualPopover.isOpen = true;
  state.addVisualPopover.position = position;
};

export const hideAddVisualPopover = ({ state }, _payload = {}) => {
  state.addVisualPopover = createAddVisualPopover();
};

// Adds a visual that shows the project layout `layoutId`, or without one, a
// visual with an empty layout of its own.
export const addVisual = ({ state }, { id, layer, layoutId } = {}) => {
  const visual = { id };
  if (layoutId) {
    visual.resourceId = layoutId;
    visual.resourceType = "layout";
  } else {
    visual.layout = createEmptyVisualLayout();
  }
  state.selectedVisuals.push({
    ...visual,
    layer: normalizeVisualLayer(layer),
    animationMode: "none",
  });
  normalizeSelectedVisualOrder(state);
};

// Gives the visual at `index` a custom layout of its own: the one it had
// before it was switched to a project layout, or else a copy of what it
// shows. A visual saved with one resource gets a layout that shows it.
const applyCustomVisualLayout = (state, index) => {
  const visual = state.selectedVisuals[index];
  if (visual.layout) {
    return;
  }

  const customLayout = state.customLayoutsByVisualId[visual.id];
  if (customLayout) {
    visual.layout = toPlainData(customLayout);
    delete visual.resourceId;
    delete visual.resourceType;
    delete visual.animationName;
    delete state.customLayoutsByVisualId[visual.id];
    return;
  }

  // The copy is made from plain data: the state here is a draft.
  const resources = selectVisualLayoutResources(state);
  resources.layouts = {
    [visual.resourceId]: toPlainData(resources.layouts[visual.resourceId]),
  };
  state.selectedVisuals[index] = toCustomLayoutVisualItem(
    toPlainData(visual),
    resources,
  );
};

// Shows a project layout, by reference, or a custom layout of the visual's
// own. The custom layout a visual leaves is kept until the panel closes.
export const updateVisualLayout = ({ state }, { index, layoutId } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  state.existingLayoutPendingVisualId = undefined;
  if (layoutId === CUSTOM_LAYOUT_VALUE) {
    applyCustomVisualLayout(state, index);
    return;
  }

  if (visual.layout) {
    state.customLayoutsByVisualId[visual.id] = toPlainData(visual.layout);
  }
  delete visual.layout;
  delete visual.animationName;
  visual.resourceId = layoutId;
  visual.resourceType = "layout";
};

// The project layouts a visual can show, in the order the panel lists them.
const getSelectableLayoutItems = (state) =>
  toFlatItems(state.layouts)
    .filter((item) => isSelectableVisualResource("layout", item))
    .filter((item) => item.type === "layout");

// The layout gallery's cards: each folder is a group named by the folder, with
// its layouts under it by their own names. Layouts outside a folder come
// first, in a group without a name. The picked layout is outlined.
const createLayoutSelectGroups = (layoutItems, selectedLayoutId, cardStyle) => {
  const groups = [];
  for (const layout of layoutItems) {
    const groupId = layout.parentId ?? "root";
    let group = groups.at(-1);
    if (group?.groupId !== groupId) {
      group = {
        groupId,
        fullLabel: layout.fullLabel.slice(
          0,
          Math.max(
            layout.fullLabel.length - layout.name.length - " > ".length,
            0,
          ),
        ),
        children: [],
      };
      groups.push(group);
    }

    const isSelected = layout.id === selectedLayoutId;
    group.children.push({
      id: layout.id,
      name: layout.name,
      previewFileId: layout.thumbnailFileId ?? layout.fileId,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
      resourceCardStyle: isSelected
        ? `${cardStyle} box-shadow: inset 0 0 0 1px var(--color-pr);`
        : cardStyle,
    });
  }
  return groups;
};

// Layout Type in the edit view. Custom Layout gives the visual a layout of
// its own, as choosing it did before. Existing Layout starts with no layout
// chosen: the visual keeps its custom layout until one is picked from the
// list under the picture.
export const updateVisualLayoutType = (
  { state },
  { index, layoutType } = {},
) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  state.existingLayoutPendingVisualId = undefined;
  if (layoutType !== EXISTING_LAYOUT_VALUE) {
    updateVisualLayout({ state }, { index, layoutId: CUSTOM_LAYOUT_VALUE });
    return;
  }

  if (!isLinkedLayoutVisualItem(visual, selectVisualLayoutResources(state))) {
    state.existingLayoutPendingVisualId = visual.id;
  }
};

// The layout editor edits a custom layout. A visual saved with one resource, which
// the panel kept as it was saved, becomes one now.
export const makeVisualLayoutCustom = ({ state }, { visualId } = {}) => {
  const index = state.selectedVisuals.findIndex(
    (visual) => visual.id === visualId,
  );
  if (index === -1) {
    return;
  }

  applyCustomVisualLayout(state, index);
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

// Without a predefined transform, a visual is centered on the screen.
export const updateVisualTransform = ({ state }, { index, transform } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  if (transform) {
    visual.transformId = transform;
  } else {
    delete visual.transformId;
  }
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
    return;
  }

  // A custom transform starts where the visual is drawn.
  applyVisualInlineTransform(visual, {
    ...normalizeBackgroundTransformEditorTransform(
      getVisualBaseTransform(state, visual),
    ),
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

export const showVisualOpacityOption = ({ state }, { index } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  visual.opacity =
    normalizeCommandLineItemOpacity(visual.opacity) ??
    DEFAULT_COMMAND_LINE_ITEM_OPACITY;
};

export const removeVisualOpacityOption = ({ state }, { index } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  delete visual.opacity;
};

export const selectVisualOpacityOptionEnabled = ({ state }, { index } = {}) => {
  return state.selectedVisuals[index]?.opacity !== undefined;
};

export const showVisualBlurOption = ({ state }, { index } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  visual.blur = normalizeCommandLineItemBlur(
    visual.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
  );
};

export const removeVisualBlurOption = ({ state }, { index } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  visual.blur = null;
};

export const selectVisualBlurOptionEnabled = ({ state }, { index } = {}) => {
  return Boolean(state.selectedVisuals[index]?.blur);
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

  visual[option.fieldName] = false;
};

export const selectVisualFlipOptionEnabled = (
  { state },
  { index, optionId } = {},
) => {
  const option = getCommandLineItemFlipOption(optionId);
  return !!option && state.selectedVisuals[index]?.[option.fieldName] === true;
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

export const clearVisuals = ({ state }, _payload = {}) => {
  state.selectedVisuals = [];
};

export const startVisualEdit = ({ state }, { index } = {}) => {
  const visual = state.selectedVisuals[index];
  if (!visual) {
    return;
  }

  state.editingVisualsSnapshot = cloneVisuals(state.selectedVisuals);
  state.editingVisualId = visual.id;
  state.selectedVisualIndex = index;
  state.mode = "edit";
};

const finishVisualEdit = (state) => {
  state.layoutSelect = createLayoutSelect();
  state.existingLayoutPendingVisualId = undefined;
  state.editingVisualId = undefined;
  state.editingVisualsSnapshot = undefined;
  state.selectedVisualIndex = undefined;
  state.mode = "current";
};

export const saveVisualEdit = ({ state }, _payload = {}) => {
  finishVisualEdit(state);
};

export const cancelVisualEdit = ({ state }, _payload = {}) => {
  if (state.editingVisualsSnapshot) {
    state.selectedVisuals = state.editingVisualsSnapshot;
  }
  finishVisualEdit(state);
};

export const selectEditingVisualId = ({ state }) => {
  return state.editingVisualId;
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

export const selectVisualIndexById = ({ state }, { visualId } = {}) => {
  return state.selectedVisuals.findIndex((visual) => visual.id === visualId);
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectSelectedVisualIndex = ({ state }) => {
  return state.selectedVisualIndex;
};

export const setExistingVisuals = ({ state }, { visuals } = {}) => {
  state.customLayoutsByVisualId = {};
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

// The resource that stands for a visual: the one it was picked from, or the
// first one its layout shows.
const getVisualMedia = (visual = {}) => {
  if (visual.layout) {
    return getVisualLayoutMedia(visual.layout);
  }

  return {
    resourceId: visual.resourceId,
    resourceType: visual.resourceType,
    animationName: visual.animationName,
  };
};

const selectVisualLayoutResources = (state) => ({
  transforms: state.transforms.items,
  animations: state.animations.items,
  images: state.images.items,
  spritesheets: state.spritesheets.items,
  videos: state.videos.items,
  particles: state.particles.items,
  layouts: state.layouts.items,
});

export const selectVisualMedia = ({ state }, { index } = {}) => {
  return getVisualMedia(state.selectedVisuals[index]);
};

// The visual item as it is saved: a layout, also for a visual saved with a
// single resource when it looks the same as one.
export const selectLayoutVisualItem = ({ state }, { item } = {}) => {
  return toLayoutVisualItem(item, selectVisualLayoutResources(state));
};

// True for a visual with its own layout, false for one that shows a project
// layout.
export const selectIsCustomLayoutVisual = ({ state }, { visualId } = {}) => {
  const visual = state.selectedVisuals.find((item) => item.id === visualId);
  return (
    visual !== undefined &&
    visual.id !== state.existingLayoutPendingVisualId &&
    !isLinkedLayoutVisualItem(visual, selectVisualLayoutResources(state))
  );
};

export const selectVisualsWithRepositoryData = ({ state }) => {
  if (!state.selectedVisuals || !Array.isArray(state.selectedVisuals)) {
    return [];
  }

  const layoutResources = selectVisualLayoutResources(state);
  return state.selectedVisuals.map((visual) => {
    const isCustomLayout = !isLinkedLayoutVisualItem(visual, layoutResources);
    const awaitsExistingLayout =
      isCustomLayout && visual.id === state.existingLayoutPendingVisualId;
    const linkedLayout = isCustomLayout
      ? undefined
      : resolveResourceItem(state, {
          resourceId: visual.resourceId,
          resourceType: "layout",
        });
    const layout = visual.layout ?? linkedLayout;
    // A project layout with a thumbnail shows it. Otherwise a layout, a
    // project one or a custom one, shows the first resource it shows.
    const media =
      (linkedLayout && !linkedLayout.previewFileId
        ? getVisualLayoutMedia(linkedLayout)
        : getVisualMedia(visual)) ?? {};
    const resource = resolveResourceItem(state, {
      resourceId: media.resourceId,
      resourceType: media.resourceType,
    });
    const spritesheetPreview =
      resource?.resourceType === "spritesheet"
        ? getSpritesheetAnimationPreview(
            state.spritesheets,
            media.resourceId,
            media.animationName,
          )
        : {};
    const spritesheetSelectionValue = toSpritesheetAnimationSelectionValue(
      media.resourceId,
      media.animationName,
    );
    // A custom layout that shows no resource, such as one of text only, is
    // named Custom Layout.
    const resourceName =
      resource?.name ??
      (layout && !media.resourceId ? "Custom Layout" : "Unknown Resource");
    const resourceType = resource?.resourceType ?? media.resourceType;
    const mediaName =
      resource?.resourceType === "spritesheet" && media.animationName
        ? `${resourceName} / ${media.animationName}`
        : resourceName;
    // A custom layout of several elements is named by its first resource and
    // how many more elements it holds. A project layout is named by its name.
    const elementCount = visual.layout
      ? countVisualLayoutElements(visual.layout)
      : 1;
    const customLayoutName =
      elementCount > 1 ? `${mediaName} +${elementCount - 1}` : mediaName;

    return {
      ...visual,
      isCustomLayout,
      // Switched to Existing Layout, with no project layout chosen yet.
      awaitsExistingLayout,
      layoutValue: awaitsExistingLayout
        ? EXISTING_LAYOUT_VALUE
        : isCustomLayout
          ? CUSTOM_LAYOUT_VALUE
          : visual.resourceId,
      layoutType:
        isCustomLayout && !awaitsExistingLayout
          ? CUSTOM_LAYOUT_VALUE
          : EXISTING_LAYOUT_VALUE,
      linkedLayoutName: linkedLayout?.name,
      resource,
      resourceType,
      mediaName,
      elementCount,
      displayName: isCustomLayout
        ? customLayoutName
        : (linkedLayout?.name ?? "Unknown Resource"),
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

export const selectViewData = ({ state, props = {}, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
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

  // The project's general layouts, which a visual of the Existing Layout
  // kind shows one of. A visual with a custom layout is a kind of its own.
  const layoutOptions = getSelectableLayoutItems(state).map((item) => ({
    value: item.id,
    label: item.fullLabel,
  }));

  // Get enriched visual data
  const enrichedVisuals = selectVisualsWithRepositoryData({ state });
  const processedSelectedVisuals = enrichedVisuals.map((visual) => {
    const mediaName = visual.resource
      ? visual.mediaName
      : localizeCommandLineText(visual.mediaName, copy);
    const customLayoutName =
      visual.elementCount > 1
        ? `${mediaName} +${visual.elementCount - 1}`
        : mediaName;
    const layoutName =
      visual.linkedLayoutName ??
      localizeCommandLineText("Unknown Resource", copy);

    // A picture of the visual alone, from the canvas, when the panel is given
    // them. Until it has one, it shows none.
    const snapshotUrl = props.visualSnapshots?.[visual.id];

    return {
      ...visual,
      snapshotUrl,
      // A visual the canvas could not take a picture of shows its resource.
      awaitsSnapshot:
        props.visualSnapshots !== undefined &&
        !Object.hasOwn(props.visualSnapshots, visual.id),
      layoutName,
      displayName: visual.isCustomLayout ? customLayoutName : layoutName,
      animationMode:
        visual.animationMode ??
        getAnimationModeById(state.animations, visual.animations?.resourceId) ??
        "none",
    };
  });

  const resourceSelectorLayout = createCommandLineResourceSelectorLayout();
  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "layout-select") {
    breadcrumb.push({
      id: "current",
      label: "Visuals",
      click: true,
    });
    breadcrumb.push({
      id: "edit",
      label: "Edit Visual",
      click: true,
    });
    breadcrumb.push({
      label: "Select layout",
    });
  } else if (state.mode === "edit") {
    breadcrumb.push({
      id: "current",
      label: "Visuals",
      click: true,
    });
    breadcrumb.push({
      label: "Edit Visual",
    });
  } else {
    breadcrumb.push({
      label: "Visuals",
    });
  }

  const visualControls = processedSelectedVisuals.map((visual, visualIndex) => {
    const blur = normalizeCommandLineItemBlur(
      visual.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
    );
    const animationCanLoop = canLoopAnimationById(
      state.animations,
      visual.animations?.resourceId,
    );

    return {
      ...visual,
      visualIndex,
      customTransform: hasInlineTransform(visual),
      customTransformDetails: createCustomTransformDetails(visual, {
        copy,
        dateTime: i18n.dateTime,
      }).map((item) => ({
        ...item,
        label: localizeCommandLineText(item.label, copy),
      })),
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
      opacityEnabled: visual.opacity !== undefined,
      opacity: visual.opacity ?? DEFAULT_COMMAND_LINE_ITEM_OPACITY,
      blurEnabled: Boolean(visual.blur),
      blur,
      blurSliderMax: {
        x: Math.max(64, blur.x),
        y: Math.max(64, blur.y),
        quality: Math.max(10, blur.quality),
      },
      flipOptions: COMMAND_LINE_ITEM_FLIP_OPTIONS.map((option) => ({
        ...option,
        enabled: visual[option.fieldName] === true,
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
    layoutOptions,
    layoutTypeOptions: localizeCommandLineOptions(
      VISUAL_LAYOUT_TYPE_OPTIONS,
      copy,
    ),
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
    blurKernelSizeOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_SELECT_OPTIONS,
      copy,
    ),
    blurRepeatEdgeOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_REPEAT_EDGE_OPTIONS,
      copy,
    ),
  };
  const visualListItems = createVisualListItems(defaultValues, copy);
  const editingVisuals = defaultValues.visuals.filter(
    (visual) => visual.id === state.editingVisualId,
  );

  return {
    mode: state.mode,
    selectedVisuals: processedSelectedVisuals,
    transformOptions,
    animationOptions,
    layerOptions: localizeCommandLineOptions(VISUAL_LAYER_OPTIONS, copy),
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    visualListItems,
    visualListGroups: createVisualListGroups(visualGroups, visualListItems),
    editingVisuals,
    form: createLocalizedVisualsForm(editingVisuals, copy),
    formKey:
      editingVisuals
        .map((visual) =>
          [
            visual.visualIndex,
            visual.id,
            visual.displayName,
            visual.layoutValue,
            visual.layer,
            visual.customTransform ? "custom-transform" : "preset-transform",
            visual.animationId ?? "no-animation",
            visual.animationMode,
            visual.opacityEnabled ? "opacity-option" : "no-opacity-option",
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
    addVisualPopover: state.addVisualPopover,
    layoutSelectGroups: createLayoutSelectGroups(
      getSelectableLayoutItems(state),
      state.layoutSelect.layoutId,
      resourceSelectorLayout.cardStyle,
    ),
    resourceSelectorGridStyle: resourceSelectorLayout.gridStyle,
    resourceSelectorItemStyle: resourceSelectorLayout.itemStyle,
    selectButtonLabel: localizeCommandLineText("Select", copy),
    addVisualForm: localizeCommandLineForm(
      createAddVisualForm({
        layoutOptions,
        layerOptions: localizeCommandLineOptions(VISUAL_LAYER_OPTIONS, copy),
      }),
      copy,
    ),
    addVisualDefaultValues: {
      layoutType: CUSTOM_LAYOUT_VALUE,
      layer: DEFAULT_VISUAL_LAYER,
    },
    noThumbnailLabel: localizeCommandLineText("No thumbnail", copy),
    noResourceLabel: localizeCommandLineText("No Resource", copy),
    selectLayoutLabel: localizeCommandLineText("Select layout", copy),
    // Under the picture of a custom layout, which has no name of its own.
    customLayoutLabel: localizeCommandLineText("Custom", copy),
    animationPlaybackLoopDisabledDescription: localizeCommandLineText(
      "loopingRequiresKeyframesDescription",
      copy,
    ),
    // The same wording as the Background's dropdown. A visual without a
    // transform is centered on the screen, as the visual list says.
    selectTransformPlaceholder: localizeCommandLineText(
      "Select transform",
      copy,
    ),
    selectAnimationPlaceholder: localizeCommandLineText(
      "Select animation",
      copy,
    ),
    addVisualButtonLabel: localizeCommandLineText("+ Add Visual", copy),
    submitButtonLabel: localizeCommandLineText("Submit", copy),
    cancelButtonLabel: localizeCommandLineText("Cancel", copy),
    saveVisualButtonLabel: localizeCommandLineText("Save Visual", copy),
    transformEditorTitle: localizeCommandLineText("Transform", copy),
  };
};
