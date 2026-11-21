import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import {
  COMMAND_LINE_ITEM_FLIP_OPTIONS,
  createCommandLineOptionMenuItems,
  getCommandLineItemFlipOption,
  getCommandLineOptionLabel,
} from "../../internal/commandLineItemEffects.js";
import {
  COMMAND_LINE_SHADER_ADJUSTMENTS,
  getCommandLineShaderAdjustment,
} from "../../internal/commandLineShaderAdjustments.js";
import { generatePrefixedId } from "../../internal/id.js";

const DEFAULT_VISUAL_LAYER = 50;
const VALID_VISUAL_LAYERS = [10, 30, 50, 70, 90];

const getIndexFromEvent = (event) => {
  const index = Number.parseInt(event?.currentTarget?.dataset?.index ?? "", 10);
  return Number.isInteger(index) ? index : undefined;
};

const getEventValue = (event) =>
  event?.detail?.value ?? event?.currentTarget?.value ?? event?.target?.value;

const parseVisualSectionId = (sectionId) => {
  const match = /^visual-(\d+)(?:-(.+))?$/.exec(sectionId ?? "");
  if (!match) {
    return undefined;
  }

  const optionId = match[2];
  if (
    optionId &&
    optionId !== "opacity" &&
    optionId !== "blur" &&
    !getCommandLineItemFlipOption(optionId) &&
    !getCommandLineShaderAdjustment(optionId)
  ) {
    return undefined;
  }

  return {
    visualIndex: Number.parseInt(match[1], 10),
    optionId,
  };
};

const normalizeVisualLayer = (layer) => {
  const parsedLayer = Number(layer);
  return VALID_VISUAL_LAYERS.includes(parsedLayer)
    ? parsedLayer
    : DEFAULT_VISUAL_LAYER;
};

const orderVisualItemsForSave = (items = []) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const layerDelta =
        normalizeVisualLayer(b.item.layer) - normalizeVisualLayer(a.item.layer);
      return layerDelta || a.index - b.index;
    })
    .map(({ item }) => item);

const TRANSFORM_FIELDS = [
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
];

const hasInlineTransform = (item = {}) =>
  TRANSFORM_FIELDS.some((field) => item?.[field] !== undefined);

// A visual shows a layout. One picked from a single resource, and not yet
// saved as a layout, keeps the resource until the store turns it into one.
const buildVisualItem = (visual = {}) => {
  const item = {
    id: visual.id,
    layer: normalizeVisualLayer(visual.layer),
  };

  if (visual.layout) {
    item.layout = structuredClone(visual.layout);
  } else {
    item.resourceId = visual.resourceId;
    item.resourceType = visual.resourceType;
    if (visual.resourceType === "spritesheet" && visual.animationName) {
      item.animationName = visual.animationName;
    }
  }

  if (visual.transformId) {
    item.transformId = visual.transformId;
  }

  if (hasInlineTransform(visual)) {
    for (const field of TRANSFORM_FIELDS) {
      if (visual[field] !== undefined) {
        item[field] = visual[field];
      }
    }
  }

  if (visual.opacity !== undefined) {
    item.opacity = visual.opacity;
  }

  if (visual.blur !== undefined) {
    item.blur = visual.blur === null ? null : { ...visual.blur };
  }

  if (visual.flipX !== undefined) {
    item.flipX = visual.flipX;
  }

  if (visual.flipY !== undefined) {
    item.flipY = visual.flipY;
  }

  if (Array.isArray(visual.filters)) {
    item.filters = structuredClone(visual.filters);
  }

  if (visual.animations?.resourceId) {
    item.animations = {
      resourceId: visual.animations.resourceId,
      playback: {
        continuity: visual.animations.playback.continuity,
        speed: visual.animations.playback.speed,
      },
    };
    if (visual.animationMode === "update") {
      item.animations.playback.loop = visual.animations.playback.loop;
    }
  }

  return item;
};

// Every visual is saved, and previewed, as a layout.
const toLayoutVisualItems = (store, visualItems) =>
  orderVisualItemsForSave(
    visualItems.map((item) => store.selectLayoutVisualItem({ item })),
  );

const buildVisualDataFromState = (store) => ({
  visual: {
    items: toLayoutVisualItems(
      store,
      store.selectSelectedVisuals().map(buildVisualItem),
    ),
  },
});

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: buildVisualDataFromState(store),
      },
    }),
  );
};

// The panel opens on a page that has the project loaded. It takes what it
// shows before its first render, so it opens with its visuals, and in the
// view it is asked for.
export const handleBeforeMount = (deps) => {
  const { projectService, store, props } = deps;
  const { animations, images, spritesheets, videos, particles, transforms } =
    projectService.getState();
  // Layouts as they are saved, with their elements as items and a tree, for
  // a custom layout to be copied from one.
  const { layouts, project } = projectService.getRepositoryState();

  store.setImages({
    images: images ?? { tree: [], items: {} },
  });
  store.setSpritesheets({
    spritesheets: spritesheets ?? { tree: [], items: {} },
  });
  store.setVideos({
    videos: videos ?? { tree: [], items: {} },
  });
  store.setLayouts({
    layouts: layouts ?? { tree: [], items: {} },
  });
  store.setParticles({
    particles: particles ?? { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: transforms ?? { tree: [], items: {} },
  });
  store.setAnimations({
    animations: animations ?? { tree: [], items: {} },
  });
  store.setResolution({ resolution: project?.resolution });

  // Use presentationState if available, otherwise fall back to visual prop
  let visualItems = null;

  if (props?.presentationState?.visual?.items) {
    visualItems = props.presentationState.visual.items;
  } else if (props?.visual?.items) {
    visualItems = props.visual.items;
  }

  // A visual saved before visuals were layouts, with one image, spritesheet,
  // video or particle, opens as the layout it is saved as, when it looks the
  // same as one, so the panel shows what Submit saves.
  if (visualItems) {
    const visuals = visualItems.map((item) =>
      store.selectLayoutVisualItem({ item }),
    );
    store.setExistingVisuals({ visuals });
    store.setHasConvertedVisuals({
      converted: visuals.some((visual, index) => visual !== visualItems[index]),
    });
  }

  // Coming back from a visual's layout opens the view it was edited from.
  if (props.editVisualId) {
    store.startVisualEdit({
      index: store.selectVisualIndexById({ visualId: props.editVisualId }),
    });
  }
};

// The canvas draws a converted visual as it is saved until the line is saved
// again, so it is shown converted, as it looks the same, for its picture and
// its transform to be taken from the layout.
export const handleAfterMount = (deps) => {
  const { store } = deps;
  if (store.selectHasConvertedVisuals()) {
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleVisualListItemClick = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.startVisualEdit({ index });
  render();
};

export const handleCancelEditClick = (deps) => {
  const { store, render } = deps;
  store.cancelVisualEdit();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSaveVisualClick = (deps) => {
  const { store, render } = deps;
  store.saveVisualEdit();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

// Asks the scene editor to save the visuals to the line and open the visual's
// layout. When the layout editor closes, this panel opens again, in the edit
// view of the visual when `returnToEditView` is set and in the list otherwise.
const dispatchVisualLayoutEdit = (deps, { visualId, returnToEditView }) => {
  const { dispatchEvent, store } = deps;
  dispatchEvent(
    new CustomEvent("visual-layout-edit", {
      detail: {
        actions: buildVisualDataFromState(store),
        visualId,
        returnToEditView,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

// The picture of a custom layout keeps the visual's changes and opens its
// layout, which a visual still saved with one resource gets now. The picture
// of an existing layout opens the layout gallery.
export const handleLayoutImageClick = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget } = payload._event;
  const { visualId } = currentTarget.dataset;
  if (!store.selectIsCustomLayoutVisual({ visualId })) {
    store.openLayoutSelect({ visualId });
    render();
    return;
  }

  store.saveVisualEdit();
  store.makeVisualLayoutCustom({ visualId });
  dispatchVisualLayoutEdit(deps, { visualId, returnToEditView: true });
};

// Layout Type: a layout of the visual's own, or one of the project's.
export const handleLayoutTypeChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.updateVisualLayoutType({
    index,
    layoutType: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

// A layout card in the gallery picks that layout.
export const handleLayoutSelectItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { resourceId } = payload._event.currentTarget.dataset;

  store.setLayoutSelectLayoutId({ layoutId: resourceId });
  render();
};

// Select: the visual shows the picked layout, back in its edit view.
export const handleLayoutSelectConfirmClick = (deps) => {
  const { store, render } = deps;

  store.confirmLayoutSelect();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleVisualContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;
  const index = parseInt(payload._event.currentTarget.dataset.index);

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    visualIndex: index,
  });

  render();
};

export const handleTransformChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualTransform({ index, transform: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleTransformModeChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.updateVisualCustomTransformEnabled({
    index,
    enabled: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleCustomTransformButtonClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const index = getIndexFromEvent(payload._event);
  const visual = store.selectSelectedVisuals()?.[index];
  if (index === undefined || !visual) {
    return;
  }

  const item = store.selectLayoutVisualItem({ item: buildVisualItem(visual) });
  dispatchEvent(
    new CustomEvent("action-transform-customize", {
      detail: {
        targetType: "visual",
        actionKey: "visual",
        itemIndex: index,
        item,
        targetName: payload._event.currentTarget?.dataset?.targetName,
        action: buildVisualDataFromState(store).visual,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleCustomTransformButtonKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  handleCustomTransformButtonClick(deps, payload);
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualAnimation({ index, animationId: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAnimationPlaybackSpeedInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.updateVisualAnimationPlaybackSpeed({
    index,
    speed: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAnimationPlaybackLoopChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.updateVisualAnimationPlaybackLoop({
    index,
    loop: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAnimationPlaybackContinuityChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.updateVisualAnimationPlaybackContinuity({
    index,
    continuity: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleOpacityInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  store.updateVisualOpacity({
    index,
    opacity: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurFieldInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  const fieldName = payload._event.currentTarget?.dataset?.blurField;

  if (index === undefined) {
    return;
  }

  store.updateVisualBlurField({
    index,
    fieldName,
    value: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurFieldChange = handleBlurFieldInput;

export const handleShaderAdjustmentInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  const adjustmentId = payload._event.currentTarget?.dataset?.adjustmentId;

  if (index === undefined || !getCommandLineShaderAdjustment(adjustmentId)) {
    return;
  }

  store.updateVisualShaderAdjustment({
    index,
    adjustmentId,
    value: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleFormSectionAction = async (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { actionId, position, sectionId } = payload._event.detail;
  const section = parseVisualSectionId(sectionId);
  if (!section) {
    return;
  }

  const { optionId, visualIndex } = section;
  const flipOption = getCommandLineItemFlipOption(optionId);
  const adjustment = getCommandLineShaderAdjustment(optionId);
  if (actionId === "remove" && optionId === "opacity") {
    store.removeVisualOpacityOption({ index: visualIndex });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  if (actionId === "remove" && optionId === "blur") {
    store.removeVisualBlurOption({ index: visualIndex });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  if (actionId === "remove" && flipOption) {
    store.removeVisualFlipOption({
      index: visualIndex,
      optionId: flipOption.id,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  if (actionId === "remove" && adjustment) {
    store.removeVisualShaderAdjustmentOption({
      index: visualIndex,
      adjustmentId: adjustment.id,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  if (actionId !== "add" || optionId) {
    return;
  }

  const copy = selectCommandLineCopy(i18n);
  const optionIds = [];
  if (!store.selectVisualOpacityOptionEnabled({ index: visualIndex })) {
    optionIds.push("opacity");
  }
  if (!store.selectVisualBlurOptionEnabled({ index: visualIndex })) {
    optionIds.push("blur");
  }
  for (const option of COMMAND_LINE_ITEM_FLIP_OPTIONS) {
    if (
      !store.selectVisualFlipOptionEnabled({
        index: visualIndex,
        optionId: option.id,
      })
    ) {
      optionIds.push(option.id);
    }
  }
  for (const shaderAdjustment of COMMAND_LINE_SHADER_ADJUSTMENTS) {
    if (
      !store.selectVisualShaderAdjustmentOptionEnabled({
        index: visualIndex,
        adjustmentId: shaderAdjustment.id,
      })
    ) {
      optionIds.push(shaderAdjustment.id);
    }
  }
  const items = createCommandLineOptionMenuItems({
    optionIds,
    getLabel: (optionId) =>
      localizeCommandLineText(getCommandLineOptionLabel(optionId), copy),
  });
  if (items.length === 0) {
    return;
  }

  const result = await appService.showDropdownMenu({
    items,
    x: position.x,
    y: position.y,
    place: "be",
  });
  if (result?.item?.key === "opacity") {
    store.showVisualOpacityOption({ index: visualIndex });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  if (result?.item?.key === "blur") {
    store.showVisualBlurOption({ index: visualIndex });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  const selectedFlipOption = getCommandLineItemFlipOption(result?.item?.key);
  if (selectedFlipOption) {
    store.showVisualFlipOption({
      index: visualIndex,
      optionId: selectedFlipOption.id,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }
  const selectedAdjustment = getCommandLineShaderAdjustment(result?.item?.key);
  if (!selectedAdjustment) {
    return;
  }

  store.showVisualShaderAdjustmentOption({
    index: visualIndex,
    adjustmentId: selectedAdjustment.id,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const visualData = buildVisualDataFromState(store);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: visualData,
      bubbles: true,
      composed: true,
    }),
  );
};

// Add Visual asks for the layer first, in a popover under the button.
export const handleAddVisualClick = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.hideDropdownMenu();
  store.openAddVisualPopover({ position: { x: rect.left, y: rect.bottom } });
  render();
};

export const handleAddVisualPopoverClose = (deps) => {
  const { store, render } = deps;
  store.hideAddVisualPopover();
  render();
};

// A new visual is added with an empty layout of its own and opens in its edit
// view, where its layout can be edited.
export const handleAddVisualFormAction = (deps, payload) => {
  const { store, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  store.hideAddVisualPopover();
  store.addVisual({ id: generatePrefixedId("visual-"), layer: values.layer });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "edit") {
    // Back from the layout gallery without choosing.
    store.closeLayoutSelect();
    render();
  } else if (payload._event.detail.id === "current") {
    // Leaving the edit view through the breadcrumb discards its edits, as
    // Cancel does.
    store.cancelVisualEdit();
    render();
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleRemoveVisualClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("removeVisual", ""),
  );

  store.removeVisual({ index: index });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { item } = payload._event.detail;
  const visualIndex = store.selectDropdownMenuVisualIndex();

  if (item.value === "delete" && visualIndex !== null) {
    store.removeVisual({ index: visualIndex });
  } else if (item.value === "move-up" && visualIndex !== null) {
    store.moveVisual({ index: visualIndex, offset: 1 });
  } else if (item.value === "move-down" && visualIndex !== null) {
    store.moveVisual({ index: visualIndex, offset: -1 });
  } else if (item.value === "move-to-layer" && visualIndex !== null) {
    store.updateVisualLayer({ index: visualIndex, layer: item.layer });
  }

  store.hideDropdownMenu();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};
