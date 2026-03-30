import { nanoid } from "nanoid";
import { filter, fromEvent, tap, debounceTime } from "rxjs";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import {
  getLayoutEditorBackPath,
  resolveLayoutEditorPayload,
} from "../../internal/layoutEditorRoute.js";
import { renderLayoutEditorPreview } from "../../internal/layoutEditorPreview.js";
import {
  applyLayoutItemDragChange,
  applyLayoutItemFieldChange,
  applyLayoutItemKeyboardChange,
} from "../../internal/layoutEditorMutations.js";
import { createLayoutEditorItemTemplate } from "../../internal/layoutEditorTypes.js";
import {
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
  syncLayoutEditorRepositoryState,
} from "../../internal/layoutEditorPersistence.js";
import { isFragmentLayout } from "../../internal/project/layout.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const DEBOUNCE_DELAYS = {
  UPDATE: 500, // Regular updates (forms, etc)
  KEYBOARD: 1000, // Keyboard final save
};

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10, // With shift key
};

const getResultErrorMessage = (result, fallbackMessage) => {
  return (
    result?.error?.message ||
    result?.error?.creatorModelError?.message ||
    fallbackMessage
  );
};

const resolveMenuItem = (detail = {}) => detail.item || detail;

const resolveSliderCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "slider"
  ) {
    return value;
  }

  return undefined;
};

const resolveFragmentCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "fragment-ref"
  ) {
    return value;
  }

  return undefined;
};

const resolveSaveLoadSlotCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "container-ref-save-load-slot"
  ) {
    return value;
  }

  return undefined;
};

const getSliderCreateOwnerConfig = (resourceType, projectService) => {
  const isControls = resourceType === "controls";
  return {
    ownerPayloadKey: isControls ? "controlId" : "layoutId",
    createElement: isControls
      ? projectService.createControlElement.bind(projectService)
      : projectService.createLayoutElement.bind(projectService),
  };
};

const getEditorPayload = (appService) =>
  resolveLayoutEditorPayload(appService.getPayload() || {});

const rerenderLayoutEditorSurface = async (
  deps,
  { renderPage = true, clearFirst = false } = {},
) => {
  if (renderPage) {
    deps.render();
  }

  await renderLayoutEditorPreview(deps, { clearFirst });
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  return () => {
    const keyboardNavigationTimeoutId =
      deps.store.selectKeyboardNavigationTimeoutId();
    if (keyboardNavigationTimeoutId !== undefined) {
      clearTimeout(keyboardNavigationTimeoutId);
      deps.store.clearKeyboardNavigationTimeout();
    }
    cleanupSubscriptions?.();
  };
};

/**
 * Schedule a final save after keyboard navigation stops
 * @param {Object} deps - Component dependencies
 * @param {string} itemId - The item ID being edited
 * @param {string} layoutId - The layout ID
 */
const scheduleKeyboardSave = (deps, itemId, layoutId) => {
  const { store } = deps;
  const keyboardNavigationTimeoutId = store.selectKeyboardNavigationTimeoutId();
  // Clear existing timeout if still navigating
  if (keyboardNavigationTimeoutId !== undefined) {
    clearTimeout(keyboardNavigationTimeoutId);
  }

  const timeoutId = setTimeout(() => {
    const { subject } = deps;

    // Check if the selected item has changed
    if (store.selectSelectedItemId() !== itemId) {
      store.clearKeyboardNavigationTimeout();
      return;
    }

    // Final render to ensure bounds are properly updated
    renderLayoutEditorPreview(deps);

    // Save final position to repository
    const finalItem = store.selectSelectedItemData();
    if (finalItem) {
      subject.dispatch("layoutEditor.updateElement", {
        layoutId,
        resourceType: store.selectLayoutResourceType(),
        selectedItemId: itemId,
        updatedItem: finalItem,
      });
    }

    store.clearKeyboardNavigationTimeout();
  }, DEBOUNCE_DELAYS.KEYBOARD);

  store.setKeyboardNavigationTimeoutId({ timeoutId });
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, refs, graphicsService } = deps;
  const payload = getEditorPayload(appService);
  const { layoutId, resourceType } = payload;
  await projectService.ensureRepository();
  syncLayoutEditorRepositoryState({
    store: deps.store,
    repositoryState: projectService.getRepositoryState(),
    layoutId,
    resourceType,
  });

  const { canvas } = refs;
  const projectResolution = deps.store.selectProjectResolution();
  await graphicsService.init({
    canvas,
    width: projectResolution.width,
    height: projectResolution.height,
  });

  await rerenderLayoutEditorSurface(deps);
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  const currentPayload = appService.getPayload() || {};
  const nextPath = getLayoutEditorBackPath(currentPayload);
  appService.navigate(nextPath, { p: currentPayload.p });
};

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => deps.render();

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store } = deps;
  const detail = payload._event.detail || {};
  const itemId = detail.id || detail.itemId || detail.item?.id;
  if (!itemId) {
    return;
  }
  store.setSelectedItemId({ itemId: itemId });
  await rerenderLayoutEditorSurface(deps);
};

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps, payload = {}) => {
  const { appService, projectService, store, refs } = deps;
  const { layoutId, resourceType } = getEditorPayload(appService);
  await projectService.ensureRepository();
  syncLayoutEditorRepositoryState({
    store,
    repositoryState: projectService.getRepositoryState(),
    layoutId,
    resourceType,
  });
  if (payload.selectedItemId) {
    store.setSelectedItemId({ itemId: payload.selectedItemId });
    refs.fileExplorer.selectItem({ itemId: payload.selectedItemId });
  }
  await rerenderLayoutEditorSurface(deps);
};

const {
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createLayoutElementsFileExplorerHandlers({
  getLayoutId: (deps) => deps.store.selectLayoutId(),
  getResourceType: (deps) => deps.store.selectLayoutResourceType(),
  refresh: refreshLayoutEditorData,
});

export const handleFileExplorerAction = async (deps, payload) => {
  const saveLoadSlotAction = resolveSaveLoadSlotCreateAction(
    payload?._event?.detail,
  );
  if (saveLoadSlotAction) {
    const { appService, projectService, store } = deps;
    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();

    if (!layoutId || resourceType !== "layouts") {
      appService.showToast("Layout is missing.", {
        title: "Error",
      });
      return;
    }

    await projectService.ensureRepository();

    const slotContainerId = nanoid();
    const slotImageId = nanoid();
    const slotDateId = nanoid();
    const parentId = payload?._event?.detail?.itemId ?? null;
    const projectResolution = store.selectProjectResolution();

    const slotContainer = createLayoutEditorItemTemplate(
      "container-save-load-slot",
      {
        projectResolution,
      },
    );
    const slotImage = createLayoutEditorItemTemplate(
      "sprite-save-load-slot-image",
      {
        projectResolution,
      },
    );
    const slotDate = createLayoutEditorItemTemplate("text-save-load-slot-date", {
      projectResolution,
    });

    const createContainerResult = await projectService.createLayoutElement({
      layoutId,
      elementId: slotContainerId,
      data: slotContainer,
      parentId,
      position: "last",
    });

    if (createContainerResult?.valid === false) {
      appService.showToast(
        getResultErrorMessage(
          createContainerResult,
          "Failed to create save/load slot.",
        ),
        {
          title: "Error",
        },
      );
      return;
    }

    const createImageResult = await projectService.createLayoutElement({
      layoutId,
      elementId: slotImageId,
      data: slotImage,
      parentId: slotContainerId,
      position: "last",
    });

    if (createImageResult?.valid === false) {
      appService.showToast(
        getResultErrorMessage(
          createImageResult,
          "Failed to create save/load slot image.",
        ),
        {
          title: "Error",
        },
      );
      return;
    }

    const createDateResult = await projectService.createLayoutElement({
      layoutId,
      elementId: slotDateId,
      data: slotDate,
      parentId: slotContainerId,
      position: "last",
    });

    if (createDateResult?.valid === false) {
      appService.showToast(
        getResultErrorMessage(
          createDateResult,
          "Failed to create save/load slot date.",
        ),
        {
          title: "Error",
        },
      );
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: slotContainerId });
    return;
  }

  const fragmentAction = resolveFragmentCreateAction(payload?._event?.detail);
  if (fragmentAction) {
    const { store, render, refs, appService } = deps;
    const fragmentLayoutOptions = store.selectViewData().fragmentLayoutOptions;

    if (fragmentLayoutOptions.length === 0) {
      appService.showToast("Mark a layout as a fragment first.", {
        title: "Warning",
      });
      return;
    }

    store.openFragmentCreateDialog({
      parentId: payload?._event?.detail?.itemId,
      defaultValues: {
        fragmentLayoutId: fragmentLayoutOptions[0].value,
      },
    });
    render();

    const fragmentCreateForm = refs.fragmentCreateForm;
    const { defaultValues } = store.selectFragmentCreateDialog();
    fragmentCreateForm.reset();
    fragmentCreateForm.setValues({
      values: defaultValues,
    });
    return;
  }

  const sliderAction = resolveSliderCreateAction(payload?._event?.detail);
  if (!sliderAction) {
    await handleBaseFileExplorerAction(deps, payload);
    return;
  }

  const { store, render, refs } = deps;
  store.openSliderCreateDialog({
    parentId: payload?._event?.detail?.itemId,
    direction: sliderAction.direction,
    defaultValues: {
      name: sliderAction.name ?? "Slider",
    },
  });
  render();

  const sliderCreateForm = refs.sliderCreateForm;
  const { defaultValues } = store.selectSliderCreateDialog();
  sliderCreateForm.reset();
  sliderCreateForm.setValues({
    values: defaultValues,
  });
};

export { handleFileExplorerTargetChanged };

export const handleDataChanged = refreshLayoutEditorData;

export const handleDialogueFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setDialogueDefaultValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handleNvlFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setNvlDefaultValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handleChoiceFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setChoiceDefaultValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handleSaveLoadFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setSaveLoadDefaultValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handlePreviewVariablesFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setPreviewVariableValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handleSliderCreateDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeSliderCreateDialog();
  store.closeSliderCreateImageSelectorDialog();
  render();
};

export const handleFragmentCreateDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeFragmentCreateDialog();
  render();
};

export const handleSliderCreateImageFieldClick = (deps, payload) => {
  const { store, render } = deps;
  const fieldName = payload._event.currentTarget?.dataset?.fieldName;
  if (!fieldName) {
    return;
  }

  store.openSliderCreateImageSelectorDialog({
    fieldName,
  });
  render();
};

export const handleSliderCreateImageClearClick = (deps, payload) => {
  const { store, render } = deps;
  const fieldName = payload._event.currentTarget?.dataset?.fieldName;
  if (!fieldName) {
    return;
  }

  store.setSliderCreateImage({
    fieldName,
    imageId: undefined,
  });
  render();
};

export const handleSliderCreateImageSelected = (deps, payload) => {
  const { store, render } = deps;
  store.setSliderCreateImageSelectorSelectedImageId({
    imageId: payload._event.detail?.imageId,
  });
  render();
};

export const handleSliderCreateImageSelectorCancel = (deps) => {
  const { store, render } = deps;
  store.closeSliderCreateImageSelectorDialog();
  render();
};

export const handleSliderCreateImageSelectorSubmit = (deps) => {
  const { store, render } = deps;
  const imageSelectorDialog = store.selectSliderCreateImageSelectorDialog();
  if (imageSelectorDialog.fieldName) {
    store.setSliderCreateImage({
      fieldName: imageSelectorDialog.fieldName,
      imageId: imageSelectorDialog.selectedImageId,
    });
  }
  store.closeSliderCreateImageSelectorDialog();
  render();
};

export const handleSliderCreateFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Slider name is required.", {
      title: "Warning",
    });
    return;
  }

  const sliderCreateDialog = store.selectSliderCreateDialog();
  const { barImageId, thumbImageId, hoverBarImageId, hoverThumbImageId } =
    sliderCreateDialog.images;

  if (!barImageId) {
    appService.showToast("Bar image is required.", {
      title: "Warning",
    });
    return;
  }

  if (!thumbImageId) {
    appService.showToast("Thumb image is required.", {
      title: "Warning",
    });
    return;
  }

  const direction =
    values?.direction === "vertical" ? "vertical" : "horizontal";

  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  if (!layoutId) {
    appService.showToast(
      resourceType === "controls"
        ? "Control is missing."
        : "Layout is missing.",
      {
        title: "Error",
      },
    );
    return;
  }

  const createType =
    direction === "vertical" ? "slider-vertical" : "slider-horizontal";
  const baseItem = createLayoutEditorItemTemplate(createType, {
    projectResolution: store.selectProjectResolution(),
  });
  const nextElementId = nanoid();
  const nextElementData = {
    ...baseItem,
    name,
    barImageId,
    thumbImageId,
  };
  if (hoverBarImageId) {
    nextElementData.hoverBarImageId = hoverBarImageId;
  }
  if (hoverThumbImageId) {
    nextElementData.hoverThumbImageId = hoverThumbImageId;
  }

  await projectService.ensureRepository();
  const { ownerPayloadKey, createElement } = getSliderCreateOwnerConfig(
    resourceType,
    projectService,
  );
  const createResult = await createElement({
    [ownerPayloadKey]: layoutId,
    elementId: nextElementId,
    data: nextElementData,
    parentId: sliderCreateDialog.parentId ?? null,
    position: "last",
  });

  if (createResult?.valid === false) {
    appService.showToast(
      getResultErrorMessage(createResult, "Failed to create slider."),
      {
        title: "Error",
      },
    );
    return;
  }

  store.closeSliderCreateDialog();
  store.closeSliderCreateImageSelectorDialog();
  await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
};

export const handleFragmentCreateFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;

  if (actionId === "cancel") {
    store.closeFragmentCreateDialog();
    deps.render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  const fragmentLayoutId = values?.fragmentLayoutId;
  if (!fragmentLayoutId) {
    appService.showToast("Fragment is required.", {
      title: "Warning",
    });
    return;
  }

  const layoutsData = store.selectLayoutsData();
  const fragmentLayout = layoutsData?.items?.[fragmentLayoutId];
  if (fragmentLayout?.type !== "layout" || !isFragmentLayout(fragmentLayout)) {
    appService.showToast("Selected fragment is invalid.", {
      title: "Error",
    });
    return;
  }

  const layoutId = store.selectLayoutId();
  if (!layoutId) {
    appService.showToast("Layout is missing.", {
      title: "Error",
    });
    return;
  }

  await projectService.ensureRepository();
  const nextElementId = nanoid();
  const createResult = await projectService.createLayoutElement({
    layoutId,
    elementId: nextElementId,
    data: {
      ...createLayoutEditorItemTemplate("fragment-ref", {
        projectResolution: store.selectProjectResolution(),
      }),
      name: fragmentLayout.name ?? "Fragment",
      fragmentLayoutId,
    },
    parentId: store.selectFragmentCreateDialog().parentId ?? null,
    position: "last",
  });

  if (createResult?.valid === false) {
    appService.showToast(
      getResultErrorMessage(createResult, "Failed to create fragment."),
      {
        title: "Error",
      },
    );
    return;
  }

  store.closeFragmentCreateDialog();
  await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
};

export const handlePreviewRevealingSpeedInput = async (deps, payload) => {
  const { store } = deps;
  const rawValue =
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value;
  const value = Number(rawValue);

  store.setPreviewRevealingSpeed({
    value: Number.isFinite(value) && value > 0 ? value : 50,
  });
  await rerenderLayoutEditorSurface(deps, { renderPage: false });
};

export const handlePlayPreviewClick = async (deps) => {
  await rerenderLayoutEditorSurface(deps, {
    renderPage: false,
    clearFirst: true,
  });
};

export const handleArrowKeyDown = async (deps, payload) => {
  const { store } = deps;
  const { _event: e } = payload;

  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }

  const unit = e.shiftKey ? KEYBOARD_UNITS.FAST : KEYBOARD_UNITS.NORMAL;
  const layoutId = store.selectLayoutId();
  const updatedItem = applyLayoutItemKeyboardChange({
    item: currentItem,
    key: payload._event.key,
    unit,
    resize: e.metaKey,
  });
  store.updateSelectedItem({ updatedItem: updatedItem });
  await rerenderLayoutEditorSurface(deps);
  scheduleKeyboardSave(deps, currentItem.id, layoutId);
};

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload) {
  const { appService, projectService } = deps;
  const { layoutId, resourceType, selectedItemId, updatedItem, replace } =
    payload;
  const persistResult = await persistLayoutEditorElementUpdate({
    projectService,
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
    replace,
  });
  if (!persistResult.didPersist) {
    return;
  }

  const currentPayload = getEditorPayload(appService);
  syncLayoutEditorRepositoryState({
    store: deps.store,
    repositoryState: projectService.getRepositoryState(),
    layoutId: currentPayload.layoutId || layoutId,
    resourceType: currentPayload.resourceType || resourceType,
  });
}

const subscriptions = (deps) => {
  const { subject, appService } = deps;
  const { isInputFocused } = appService;
  return [
    createCollabRemoteRefreshStream({
      deps,
      matches: matchesRemoteTargets([
        "layouts",
        "controls",
        "images",
        "textStyles",
        "colors",
        "fonts",
        "variables",
      ]),
      refresh: refreshLayoutEditorData,
    }),
    fromEvent(window, "keydown").pipe(
      filter((e) => {
        const isInput = isInputFocused();
        if (isInput) {
          return;
        }
        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.key,
        );
      }),
      tap((e) => {
        handleArrowKeyDown(deps, { _event: e });
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-start"),
      tap(() => {
        handlePointerUp(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-end"),
      tap(() => {
        handlePointerDown(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-move"),
      tap(({ payload }) => {
        handleCanvasMouseMove(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElement"),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      tap(async ({ payload }) => {
        await handleDebouncedUpdate(deps, payload);
      }),
    ),
  ];
};

export const handleLayoutEditPanelUpdateHandler = async (deps, payload) => {
  const { store } = deps;
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = store.selectSelectedItemId();
  const detail = payload._event.detail;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  const updatedItem = applyLayoutItemFieldChange({
    item: currentItem,
    name: detail.name,
    value: detail.value,
    imagesData: store.selectImages(),
  });

  store.updateSelectedItem({ updatedItem: updatedItem });

  if (shouldPersistLayoutEditorFieldImmediately(detail.name)) {
    await handleDebouncedUpdate(deps, {
      layoutId,
      resourceType,
      selectedItemId,
      updatedItem,
    });
  } else {
    const { subject } = deps;
    subject.dispatch("layoutEditor.updateElement", {
      layoutId,
      resourceType,
      selectedItemId,
      updatedItem,
    });
  }

  await rerenderLayoutEditorSurface(deps);
};

export const handleCanvasMouseMove = (deps, payload) => {
  const { store, subject } = deps;
  if (
    !payload ||
    typeof payload.x !== "number" ||
    typeof payload.y !== "number"
  ) {
    return;
  }
  const { x, y } = payload;

  const drag = store.selectDragging();

  const item = store.selectSelectedItemData();
  if (!item) {
    return;
  }
  if (!drag.dragStartPosition) {
    store.setDragStartPosition({
      x,
      y,
      itemStartX: item.x,
      itemStartY: item.y,
    });
    return;
  }

  const updatedItem = applyLayoutItemDragChange({
    item,
    dragStartPosition: drag.dragStartPosition,
    x,
    y,
  });

  store.updateSelectedItem({ updatedItem: updatedItem });
  renderLayoutEditorPreview(deps);

  subject.dispatch("layoutEditor.updateElement", {
    layoutId: store.selectLayoutId(),
    resourceType: store.selectLayoutResourceType(),
    selectedItemId: item.id,
    updatedItem,
  });
};

export const handlePointerUp = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  store.startDragging({});
  render();
};

export const handlePointerDown = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  store.stopDragging({ isDragging: false });
  render();
};
