import { nanoid } from "nanoid";
import { filter, tap, debounceTime } from "rxjs";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import {
  getLayoutEditorBackPath,
  resolveLayoutEditorPayload,
} from "../../internal/layoutEditorRoute.js";
import { getFragmentLayoutOptions } from "../../internal/layoutFragments.js";
import { applyLayoutItemFieldChange } from "../../internal/layoutEditorMutations.js";
import { getLayoutEditorCreateDefinition } from "../../internal/layoutEditorElementRegistry.js";
import {
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
} from "../../internal/layoutEditorPersistence.js";
import { isFragmentLayout } from "../../internal/project/layout.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createLayoutEditorRepositoryStoreData } from "../../internal/ui/layoutEditor/layoutEditorRepositoryState.js";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const DEBOUNCE_DELAYS = {
  UPDATE: 500,
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

const createFragmentCreateForm = (fragmentLayoutOptions = []) => {
  return {
    title: "Insert Fragment",
    description: "Choose which fragment layout to insert into this layout",
    fields: [
      {
        name: "fragmentLayoutId",
        type: "select",
        label: "Fragment",
        required: true,
        clearable: false,
        options: fragmentLayoutOptions,
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
          align: "left",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Insert Fragment",
          validate: true,
        },
      ],
    },
  };
};

const getEditorPayload = (appService) =>
  resolveLayoutEditorPayload(appService.getPayload() || {});

const restartLayoutEditorPreview = (deps) => {
  deps.refs.layoutEditorCanvas.restartPreview();
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  return () => {
    cleanupSubscriptions?.();
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService } = deps;
  const payload = getEditorPayload(appService);
  const { layoutId, resourceType } = payload;
  await projectService.ensureRepository();
  deps.store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId,
      resourceType,
    }),
  );
  deps.render();
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
  deps.render();
};

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps, payload = {}) => {
  const { appService, projectService, store, refs } = deps;
  const { layoutId, resourceType } = getEditorPayload(appService);
  await projectService.ensureRepository();
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId,
      resourceType,
    }),
  );
  if (payload.selectedItemId) {
    store.setSelectedItemId({ itemId: payload.selectedItemId });
    refs.fileExplorer.selectItem({ itemId: payload.selectedItemId });
  }
  deps.render();
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

    const slotContainer = getLayoutEditorCreateDefinition(
      "container-save-load-slot",
      {
        projectResolution,
      },
    ).template;
    const slotImage = getLayoutEditorCreateDefinition(
      "sprite-save-load-slot-image",
      {
        projectResolution,
      },
    ).template;
    const slotDate = getLayoutEditorCreateDefinition(
      "text-save-load-slot-date",
      {
        projectResolution,
      },
    ).template;

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
    const { appService, projectService, store } = deps;
    const parentId = payload?._event?.detail?.itemId ?? null;
    const fragmentLayoutOptions = getFragmentLayoutOptions(
      store.selectLayoutsData(),
      {
        excludeLayoutId: store.selectLayoutId(),
      },
    );

    if (fragmentLayoutOptions.length === 0) {
      appService.showToast("Mark a layout as a fragment first.", {
        title: "Warning",
      });
      return;
    }

    const dialogResult = await appService.showFormDialog({
      form: createFragmentCreateForm(fragmentLayoutOptions),
      defaultValues: {
        fragmentLayoutId: fragmentLayoutOptions[0].value,
      },
    });

    if (!dialogResult || dialogResult.actionId !== "submit") {
      return;
    }

    const fragmentLayoutId = dialogResult.values?.fragmentLayoutId;
    if (!fragmentLayoutId) {
      appService.showToast("Fragment is required.", {
        title: "Warning",
      });
      return;
    }

    const layoutsData = store.selectLayoutsData();
    const fragmentLayout = layoutsData?.items?.[fragmentLayoutId];
    if (
      fragmentLayout?.type !== "layout" ||
      !isFragmentLayout(fragmentLayout)
    ) {
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
        ...getLayoutEditorCreateDefinition("fragment-ref", {
          projectResolution: store.selectProjectResolution(),
        }).template,
        name: fragmentLayout.name ?? "Fragment",
        fragmentLayoutId,
      },
      parentId,
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

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
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

export const handleSliderCreateDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeSliderCreateDialog();
  store.closeSliderCreateImageSelectorDialog();
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
  const baseItem = getLayoutEditorCreateDefinition(createType, {
    projectResolution: store.selectProjectResolution(),
  }).template;
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
  deps.store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId: currentPayload.layoutId || layoutId,
      resourceType: currentPayload.resourceType || resourceType,
    }),
  );
}

const subscriptions = (deps) => {
  const { subject } = deps;
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
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElement"),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      tap(async ({ payload }) => {
        await handleDebouncedUpdate(deps, payload);
      }),
    ),
  ];
};

export const handleLayoutEditorCanvasDragUpdate = (deps, payload) => {
  const updatedItem = payload._event.detail?.updatedItem;
  if (!updatedItem) {
    return;
  }

  deps.store.updateSelectedItem({ updatedItem });
  deps.render();
};

export const handleLayoutEditorCanvasUpdate = async (deps, payload) => {
  const { store } = deps;
  const updatedItem = payload._event.detail?.updatedItem;
  if (!updatedItem) {
    return;
  }

  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = payload._event.detail?.itemId || updatedItem.id;

  store.updateSelectedItem({ updatedItem });
  deps.render();

  await handleDebouncedUpdate(deps, {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
  });
};

export const handleLayoutEditorPreviewDataChange = (deps, payload) => {
  deps.store.setPreviewData({
    previewData: payload._event.detail?.previewData,
  });
  deps.render();
};

export const handleLayoutEditorPreviewPlay = (deps) => {
  restartLayoutEditorPreview(deps);
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

  if (
    shouldPersistLayoutEditorFieldImmediately({
      name: detail.name,
      itemType: currentItem.type,
    })
  ) {
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

  deps.render();
};
