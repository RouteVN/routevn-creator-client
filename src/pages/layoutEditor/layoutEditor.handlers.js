import { generateId } from "../../internal/id.js";
import { concatMap, debounceTime, filter, from } from "rxjs";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import { isSqliteLockError } from "../../internal/sqliteLocking.js";
import {
  getLayoutEditorBackPath,
  resolveLayoutEditorPayload,
} from "../../internal/layoutEditorRoute.js";
import { getFragmentLayoutOptions } from "./support/layoutFragments.js";
import { applyLayoutItemFieldChange } from "./support/layoutEditorMutations.js";
import { getLayoutEditorCreateDefinition } from "../../internal/layoutEditorElementRegistry.js";
import {
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
} from "./support/layoutEditorPersistence.js";
import {
  enqueueLayoutEditorPersistence,
  waitForLayoutEditorPersistenceIdle,
} from "./support/layoutEditorPersistenceQueue.js";
import { isFragmentLayout } from "../../internal/project/layout.js";
import {
  getFirstSpritesheetAnimationSelectionValue,
  getSpritesheetResourceDefaultSize,
  parseSpritesheetAnimationSelectionValue,
  toSpritesheetAnimationSelectionItems,
} from "../../internal/spritesheets.js";
import {
  getFirstParticleSelectionValue,
  getParticleResourceDefaultSize,
  toParticleSelectionItems,
} from "../../internal/particles.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createLayoutEditorRepositoryStoreData } from "./support/layoutEditorRepositoryState.js";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const DEBOUNCE_DELAYS = {
  UPDATE: 500,
};

const SLIDER_CREATE_DIALOG_COMPONENT = "rvn-layout-editor-slider-create-dialog";
const SPRITE_CREATE_DIALOG_COMPONENT = "rvn-layout-editor-sprite-create-dialog";
const LAYOUT_EDITOR_PERSIST_ERROR_COOLDOWN_MS = 1500;

const getResultErrorMessage = (result, fallbackMessage) => {
  return (
    result?.error?.message ||
    result?.error?.creatorModelError?.message ||
    fallbackMessage
  );
};

const showLayoutEditorError = ({
  appService,
  store,
  error,
  fallbackMessage,
  lockedMessage = fallbackMessage,
  throttle = false,
} = {}) => {
  if (throttle) {
    const now = Date.now();
    const lastPersistErrorAt = store.selectLastPersistErrorAt();
    if (
      Number.isFinite(lastPersistErrorAt) &&
      now - lastPersistErrorAt < LAYOUT_EDITOR_PERSIST_ERROR_COOLDOWN_MS
    ) {
      return;
    }
    store.setLastPersistErrorAt({
      timestamp: now,
    });
  }

  const message = isSqliteLockError(error)
    ? lockedMessage
    : error?.message || fallbackMessage;
  appService.showAlert({ message: message, title: "Error" });
};

const runLayoutEditorPersistence = (deps, task) => {
  return enqueueLayoutEditorPersistence({
    owner: deps.projectService,
    task,
  });
};

const getLayoutEditorOwnerConfig = (resourceType, projectService) => {
  const isControls = resourceType === "controls";
  return {
    ownerPayloadKey: isControls ? "controlId" : "layoutId",
    ownerLabel: isControls ? "Control" : "Layout",
    updateItem: isControls
      ? projectService.updateControlItem.bind(projectService)
      : projectService.updateLayoutItem.bind(projectService),
  };
};

const dataUrlToBlob = async (value) => {
  const response = await fetch(value);
  return response.blob();
};

const resolveMenuItem = (detail = {}) => detail.item || detail;

const areSelectedElementMetricsEqual = (left, right) => {
  return (
    left?.id === right?.id &&
    left?.type === right?.type &&
    left?.width === right?.width &&
    left?.height === right?.height &&
    left?.measuredWidth === right?.measuredWidth
  );
};

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

const resolveSpriteCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "sprite"
  ) {
    return value;
  }

  return undefined;
};

const resolveSpritesheetCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "spritesheet-animation"
  ) {
    return value;
  }

  return undefined;
};

const resolveParticleCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "particle"
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

const createSpritesheetCreateForm = (selectionItems = []) => {
  return {
    title: "Create Spritesheet Animation",
    description:
      "Choose which imported spritesheet animation to insert into the layout",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "spritesheetSelection",
        type: "select",
        label: "Animation",
        required: true,
        clearable: false,
        options: selectionItems,
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
          label: "Create Animation",
          validate: true,
        },
      ],
    },
  };
};

const createParticleCreateForm = (selectionItems = []) => {
  return {
    title: "Create Particle",
    description: "Choose which particle effect to insert into the layout",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "particleId",
        type: "select",
        label: "Particle",
        required: true,
        clearable: false,
        options: selectionItems,
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
          label: "Create Particle",
          validate: true,
        },
      ],
    },
  };
};

const getEditorPayload = (appService) =>
  resolveLayoutEditorPayload(appService.getPayload() || {});

const queuePendingLayoutEditorPersist = (
  store,
  { layoutId, resourceType, selectedItemId, updatedItem, replace } = {},
) => {
  const pendingPayload = {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
    replace,
    persistenceRequestId: generateId(),
  };

  store.setPendingPersistPayload({
    payload: pendingPayload,
  });

  return pendingPayload;
};

const flushQueuedLayoutEditorUpdates = async (deps) => {
  const { projectService, store } = deps;
  const pendingPayload = store.selectPendingPersistPayload();

  let flushResult = {
    ok: true,
  };
  if (pendingPayload) {
    flushResult = await handleDebouncedUpdate(deps, pendingPayload);
  }

  const idleResult = await waitForLayoutEditorPersistenceIdle({
    owner: projectService,
  });

  if (flushResult.ok === false) {
    return flushResult;
  }

  if (idleResult?.ok === false) {
    return idleResult;
  }

  return flushResult;
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  return async () => {
    await flushQueuedLayoutEditorUpdates(deps);
    cleanupSubscriptions?.();
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const payload = getEditorPayload(appService);
  const { layoutId, resourceType } = payload;
  await projectService.ensureRepository();
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId,
      resourceType,
    }),
  );
  render();
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  const flushResult = await flushQueuedLayoutEditorUpdates(deps);
  if (!flushResult.ok) {
    return;
  }
  const currentPayload = appService.getPayload() || {};
  const nextPath = getLayoutEditorBackPath(currentPayload);
  appService.navigate(nextPath, { p: currentPayload.p });
};

export const handleSaveButtonClick = async (deps) => {
  const { appService, projectService, refs, store } = deps;
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const previewData = store.selectPreviewData();
  const { ownerPayloadKey, ownerLabel, updateItem } =
    getLayoutEditorOwnerConfig(resourceType, projectService);

  if (!layoutId) {
    appService.showAlert({
      message: `${ownerLabel} is missing.`,
      title: "Error",
    });
    return;
  }

  try {
    const thumbnailImage =
      await refs.layoutEditorCanvas.captureThumbnailImage();
    if (!thumbnailImage) {
      appService.showAlert({
        message: `Failed to capture ${ownerLabel.toLowerCase()} thumbnail.`,
        title: "Error",
      });
      return;
    }

    const thumbnailBlob = await dataUrlToBlob(thumbnailImage);
    const storedFile = await projectService.storeFile({
      file: thumbnailBlob,
    });
    const updateResult = await updateItem({
      [ownerPayloadKey]: layoutId,
      data: {
        thumbnailFileId: storedFile.fileId,
        preview: previewData,
      },
      fileRecords: storedFile.fileRecords,
    });

    if (updateResult?.valid === false) {
      appService.showAlert({
        message: `Failed to save ${ownerLabel.toLowerCase()} preview.`,
        title: "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, {
      selectedItemId: store.selectSelectedItemId(),
    });
    appService.showToast({ message: `${ownerLabel} preview saved.` });
  } catch {
    appService.showAlert({
      message: `Failed to save ${ownerLabel.toLowerCase()} preview.`,
      title: "Error",
    });
  }
};

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => {
  const { render } = deps;
  render();
};

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const itemId = detail.id || detail.itemId || detail.item?.id;
  if (!itemId) {
    return;
  }
  store.setSelectedItemId({ itemId: itemId });
  render();
};

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps, payload = {}) => {
  const { appService, projectService, store, refs, render } = deps;
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
  render();
};

const {
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createLayoutElementsFileExplorerHandlers({
  getLayoutId: ({ store }) => store.selectLayoutId(),
  getResourceType: ({ store }) => store.selectLayoutResourceType(),
  refresh: refreshLayoutEditorData,
});

const showSliderCreateDialog = async (appService, sliderAction = {}) => {
  return appService.showComponentDialog({
    component: SLIDER_CREATE_DIALOG_COMPONENT,
    title: "Create Slider",
    description: "Choose the slider images before inserting it into the layout",
    size: "md",
    props: {
      direction: sliderAction.direction,
      defaultValues: {
        name: sliderAction.name ?? "Slider",
      },
    },
    actions: {
      buttons: [
        {
          id: "cancel",
          label: "Cancel",
          variant: "se",
          align: "left",
          role: "cancel",
        },
        {
          id: "create",
          label: "Create Slider",
          variant: "pr",
          role: "confirm",
          validate: true,
        },
      ],
    },
  });
};

const showSpriteCreateDialog = async (appService, spriteAction = {}) => {
  return appService.showComponentDialog({
    component: SPRITE_CREATE_DIALOG_COMPONENT,
    title: "Create Sprite",
    description: "Choose the sprite image before inserting it into the layout",
    size: "md",
    props: {
      defaultValues: {
        name: spriteAction.name ?? "Sprite",
      },
    },
    actions: {
      buttons: [
        {
          id: "cancel",
          label: "Cancel",
          variant: "se",
          align: "left",
          role: "cancel",
        },
        {
          id: "create",
          label: "Create Sprite",
          variant: "pr",
          role: "confirm",
          validate: true,
        },
      ],
    },
  });
};

const handleFileExplorerActionUnsafe = async (deps, payload) => {
  const saveLoadSlotAction = resolveSaveLoadSlotCreateAction(
    payload?._event?.detail,
  );
  if (saveLoadSlotAction) {
    const { appService, projectService, store } = deps;
    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();

    if (!layoutId || resourceType !== "layouts") {
      appService.showAlert({ message: "Layout is missing.", title: "Error" });
      return;
    }

    await projectService.ensureRepository();

    const slotContainerId = generateId();
    const slotImageId = generateId();
    const slotDateId = generateId();
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
      appService.showAlert({
        message: getResultErrorMessage(
          createContainerResult,
          "Failed to create save/load slot.",
        ),
        title: "Error",
      });
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
      appService.showAlert({
        message: getResultErrorMessage(
          createImageResult,
          "Failed to create save/load slot image.",
        ),
        title: "Error",
      });
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
      appService.showAlert({
        message: getResultErrorMessage(
          createDateResult,
          "Failed to create save/load slot date.",
        ),
        title: "Error",
      });
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
      appService.showAlert({
        message: "Mark a layout as a fragment first.",
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
      appService.showAlert({
        message: "Fragment is required.",
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
      appService.showAlert({
        message: "Selected fragment is invalid.",
        title: "Error",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    if (!layoutId) {
      appService.showAlert({ message: "Layout is missing.", title: "Error" });
      return;
    }

    await projectService.ensureRepository();
    const nextElementId = generateId();
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
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          "Failed to create fragment.",
        ),
        title: "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  const spritesheetAction = resolveSpritesheetCreateAction(
    payload?._event?.detail,
  );
  if (spritesheetAction) {
    const { appService, projectService, store } = deps;
    const parentId = payload?._event?.detail?.itemId ?? null;
    const spritesheetsData = store.selectSpritesheetsData();
    const selectionItems =
      toSpritesheetAnimationSelectionItems(spritesheetsData);

    if (selectionItems.length === 0) {
      appService.showAlert({
        message: "Import a spritesheet first.",
        title: "Warning",
      });
      return;
    }

    const dialogResult = await appService.showFormDialog({
      form: createSpritesheetCreateForm(selectionItems),
      defaultValues: {
        name: spritesheetAction.name ?? "Spritesheet Animation",
        spritesheetSelection:
          getFirstSpritesheetAnimationSelectionValue(spritesheetsData),
      },
    });

    if (!dialogResult || dialogResult.actionId !== "submit") {
      return;
    }

    const name = dialogResult.values?.name?.trim();
    if (!name) {
      appService.showAlert({
        message: "Animation name is required.",
        title: "Warning",
      });
      return;
    }

    const { resourceId, animationName } =
      parseSpritesheetAnimationSelectionValue(
        dialogResult.values?.spritesheetSelection,
      );
    if (!resourceId || !animationName) {
      appService.showAlert({
        message: "Spritesheet animation is required.",
        title: "Warning",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    if (!layoutId) {
      appService.showAlert({
        message:
          resourceType === "controls"
            ? "Control is missing."
            : "Layout is missing.",
        title: "Error",
      });
      return;
    }

    const nextElementId = generateId();
    const nextElementData = {
      ...getLayoutEditorCreateDefinition("spritesheet-animation", {
        projectResolution: store.selectProjectResolution(),
      }).template,
      name,
      resourceId,
      animationName,
    };
    const resourceSize = getSpritesheetResourceDefaultSize(
      spritesheetsData,
      resourceId,
    );
    if (Number.isFinite(resourceSize.width) && resourceSize.width > 0) {
      nextElementData.width = resourceSize.width;
    }
    if (Number.isFinite(resourceSize.height) && resourceSize.height > 0) {
      nextElementData.height = resourceSize.height;
    }
    if (
      Number.isFinite(nextElementData.width) &&
      Number.isFinite(nextElementData.height) &&
      nextElementData.width > 0 &&
      nextElementData.height > 0
    ) {
      nextElementData.aspectRatioLock =
        nextElementData.width / nextElementData.height;
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
      parentId,
      position: "last",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          "Failed to create spritesheet animation.",
        ),
        title: "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  const particleAction = resolveParticleCreateAction(payload?._event?.detail);
  if (particleAction) {
    const { appService, projectService, store } = deps;
    const parentId = payload?._event?.detail?.itemId ?? null;
    const particlesData = store.selectParticlesData();
    const selectionItems = toParticleSelectionItems(particlesData);

    if (selectionItems.length === 0) {
      appService.showAlert({
        message: "Create a particle effect first.",
        title: "Warning",
      });
      return;
    }

    const dialogResult = await appService.showFormDialog({
      form: createParticleCreateForm(selectionItems),
      defaultValues: {
        name: particleAction.name ?? "Particle",
        particleId: getFirstParticleSelectionValue(particlesData),
      },
    });

    if (!dialogResult || dialogResult.actionId !== "submit") {
      return;
    }

    const name = dialogResult.values?.name?.trim();
    if (!name) {
      appService.showAlert({
        message: "Particle name is required.",
        title: "Warning",
      });
      return;
    }

    const particleId = dialogResult.values?.particleId;
    if (!particleId) {
      appService.showAlert({
        message: "Particle is required.",
        title: "Warning",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    if (!layoutId) {
      appService.showAlert({
        message:
          resourceType === "controls"
            ? "Control is missing."
            : "Layout is missing.",
        title: "Error",
      });
      return;
    }

    const nextElementId = generateId();
    const nextElementData = {
      ...getLayoutEditorCreateDefinition("particle", {
        projectResolution: store.selectProjectResolution(),
      }).template,
      name,
      particleId,
    };
    const resourceSize = getParticleResourceDefaultSize(
      particlesData,
      particleId,
    );
    if (Number.isFinite(resourceSize.width) && resourceSize.width > 0) {
      nextElementData.width = resourceSize.width;
    }
    if (Number.isFinite(resourceSize.height) && resourceSize.height > 0) {
      nextElementData.height = resourceSize.height;
    }
    if (
      Number.isFinite(nextElementData.width) &&
      Number.isFinite(nextElementData.height) &&
      nextElementData.width > 0 &&
      nextElementData.height > 0
    ) {
      nextElementData.aspectRatioLock =
        nextElementData.width / nextElementData.height;
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
      parentId,
      position: "last",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          "Failed to create particle.",
        ),
        title: "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  const spriteAction = resolveSpriteCreateAction(payload?._event?.detail);
  const sliderAction = resolveSliderCreateAction(payload?._event?.detail);
  if (!spriteAction && !sliderAction) {
    await handleBaseFileExplorerAction(deps, payload);
    return;
  }

  const { appService, projectService, store } = deps;
  const parentId = payload?._event?.detail?.itemId ?? null;

  if (spriteAction) {
    let spriteDialogResult;

    try {
      spriteDialogResult = await showSpriteCreateDialog(
        appService,
        spriteAction,
      );
    } catch {
      appService.showAlert({
        message: "Failed to open sprite dialog.",
        title: "Error",
      });
      return;
    }

    if (!spriteDialogResult || spriteDialogResult.actionId !== "create") {
      return;
    }

    const values = spriteDialogResult.values ?? {};
    const name = values.name?.trim();
    if (!name) {
      appService.showAlert({
        message: "Sprite name is required.",
        title: "Warning",
      });
      return;
    }

    const imageId = values.imageId;
    if (!imageId) {
      appService.showAlert({ message: "Image is required.", title: "Warning" });
      return;
    }

    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    if (!layoutId) {
      appService.showAlert({
        message:
          resourceType === "controls"
            ? "Control is missing."
            : "Layout is missing.",
        title: "Error",
      });
      return;
    }

    const nextElementId = generateId();
    const nextElementData = {
      ...getLayoutEditorCreateDefinition("sprite", {
        projectResolution: store.selectProjectResolution(),
      }).template,
      name,
      imageId,
    };
    const image = store.selectImages()?.items?.[imageId];
    if (Number.isFinite(image?.width) && image.width > 0) {
      nextElementData.width = image.width;
    }
    if (Number.isFinite(image?.height) && image.height > 0) {
      nextElementData.height = image.height;
    }
    if (
      Number.isFinite(nextElementData.width) &&
      Number.isFinite(nextElementData.height) &&
      nextElementData.width > 0 &&
      nextElementData.height > 0
    ) {
      nextElementData.aspectRatioLock =
        nextElementData.width / nextElementData.height;
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
      parentId,
      position: "last",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          "Failed to create sprite.",
        ),
        title: "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  let dialogResult;

  try {
    dialogResult = await showSliderCreateDialog(appService, sliderAction);
  } catch {
    appService.showAlert({
      message: "Failed to open slider dialog.",
      title: "Error",
    });
    return;
  }

  if (!dialogResult || dialogResult.actionId !== "create") {
    return;
  }

  const values = dialogResult.values ?? {};
  const name = values.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Slider name is required.",
      title: "Warning",
    });
    return;
  }

  const barImageId = values.barImageId;
  const thumbImageId = values.thumbImageId;
  const hoverBarImageId = values.hoverBarImageId;
  const hoverThumbImageId = values.hoverThumbImageId;

  if (!barImageId) {
    appService.showAlert({
      message: "Bar image is required.",
      title: "Warning",
    });
    return;
  }

  if (!thumbImageId) {
    appService.showAlert({
      message: "Thumb image is required.",
      title: "Warning",
    });
    return;
  }

  const direction = values.direction === "vertical" ? "vertical" : "horizontal";
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  if (!layoutId) {
    appService.showAlert({
      message:
        resourceType === "controls"
          ? "Control is missing."
          : "Layout is missing.",
      title: "Error",
    });
    return;
  }

  const createType =
    direction === "vertical" ? "slider-vertical" : "slider-horizontal";
  const baseItem = getLayoutEditorCreateDefinition(createType, {
    projectResolution: store.selectProjectResolution(),
  }).template;
  const nextElementId = generateId();
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
    parentId,
    position: "last",
  });

  if (createResult?.valid === false) {
    appService.showAlert({
      message: getResultErrorMessage(createResult, "Failed to create slider."),
      title: "Error",
    });
    return;
  }

  await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
};

export const handleFileExplorerAction = async (deps, payload) => {
  try {
    await handleFileExplorerActionUnsafe(deps, payload);
  } catch (error) {
    console.error("[layoutEditor] Failed to create layout item", {
      error,
    });
    showLayoutEditorError({
      appService: deps.appService,
      store: deps.store,
      error,
      fallbackMessage: "Failed to create layout item.",
      lockedMessage:
        "The project database is busy. RouteVN couldn't create the layout item. Please wait a moment and try again.",
    });
  }
};

export { handleFileExplorerTargetChanged };

export const handleDataChanged = refreshLayoutEditorData;

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload) {
  const { appService, projectService, store } = deps;
  const { layoutId, resourceType, selectedItemId, updatedItem, replace } =
    payload;

  if (
    payload.persistenceRequestId &&
    store.selectPendingPersistPayload()?.persistenceRequestId !==
      payload.persistenceRequestId
  ) {
    return {
      ok: true,
      skipped: true,
    };
  }

  return runLayoutEditorPersistence(deps, async () => {
    try {
      const persistResult = await persistLayoutEditorElementUpdate({
        projectService,
        layoutId,
        resourceType,
        selectedItemId,
        updatedItem,
        replace,
      });
      if (!persistResult.didPersist) {
        store.clearPendingPersistPayload({
          persistenceRequestId: payload.persistenceRequestId,
        });
        return {
          ok: true,
          didPersist: false,
        };
      }

      if (persistResult.updateResult?.valid === false) {
        showLayoutEditorError({
          appService,
          store,
          error: persistResult.updateResult?.error,
          fallbackMessage: getResultErrorMessage(
            persistResult.updateResult,
            "Failed to save layout changes.",
          ),
          lockedMessage:
            "The project database is busy. RouteVN couldn't save the latest layout changes. Please wait a moment and try again.",
          throttle: true,
        });
        return {
          ok: false,
        };
      }

      const currentPayload = getEditorPayload(appService);
      store.syncRepositoryState(
        createLayoutEditorRepositoryStoreData({
          repositoryState: projectService.getRepositoryState(),
          layoutId: currentPayload.layoutId || layoutId,
          resourceType: currentPayload.resourceType || resourceType,
        }),
      );
      store.clearPendingPersistPayload({
        persistenceRequestId: payload.persistenceRequestId,
      });
      return {
        ok: true,
        didPersist: true,
      };
    } catch (error) {
      console.error("[layoutEditor] Failed to save layout changes", {
        error,
        layoutId,
        resourceType,
        selectedItemId,
      });
      showLayoutEditorError({
        appService,
        store,
        error,
        fallbackMessage: "Failed to save layout changes.",
        lockedMessage:
          "The project database is busy. RouteVN couldn't save the latest layout changes. Please wait a moment and try again.",
        throttle: true,
      });
      return {
        ok: false,
      };
    }
  });
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
        "spritesheets",
        "particles",
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
      concatMap(({ payload }) => from(handleDebouncedUpdate(deps, payload))),
    ),
  ];
};

export const handleLayoutEditorCanvasDragUpdate = (deps, payload) => {
  const { store, render, subject } = deps;
  const updatedItem = payload._event.detail?.updatedItem;
  if (!updatedItem) {
    return;
  }

  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = payload._event.detail?.itemId || updatedItem.id;
  const pendingPayload = queuePendingLayoutEditorPersist(store, {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
  });

  store.updateSelectedItem({
    itemId: selectedItemId,
    updatedItem,
  });
  subject.dispatch("layoutEditor.updateElement", pendingPayload);
  render();
};

export const handleLayoutEditorCanvasUpdate = async (deps, payload) => {
  const { store, render } = deps;
  const updatedItem = payload._event.detail?.updatedItem;
  if (!updatedItem) {
    return;
  }

  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = payload._event.detail?.itemId || updatedItem.id;
  const pendingPayload = queuePendingLayoutEditorPersist(store, {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
  });

  store.updateSelectedItem({
    itemId: selectedItemId,
    updatedItem,
  });
  render();

  await handleDebouncedUpdate(deps, pendingPayload);
};

export const handleLayoutEditorCanvasMetricsChange = (deps, payload) => {
  const { store, render } = deps;
  const metrics = payload._event.detail?.metrics;
  const currentMetrics = store.selectSelectedElementMetrics();

  if (areSelectedElementMetricsEqual(currentMetrics, metrics)) {
    return;
  }

  store.setSelectedElementMetrics({ metrics });
  render();
};

export const handleLayoutEditorPreviewDataChange = (deps, payload) => {
  const { store, render } = deps;
  store.setPreviewData({
    previewData: payload._event.detail?.previewData,
  });
  render();
};

export const handleLayoutEditorPreviewPlay = (deps) => {
  const { refs } = deps;
  refs.layoutEditorCanvas.restartPreview();
};

export const handleLayoutEditPanelUpdateHandler = async (deps, payload) => {
  const { store, render } = deps;
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = store.selectSelectedItemId();
  const detail = payload._event.detail;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  const nextAspectRatioLock =
    Number.isFinite(detail.formValues?.aspectRatioLock) &&
    detail.formValues.aspectRatioLock > 0
      ? detail.formValues.aspectRatioLock
      : currentItem.aspectRatioLock;
  const currentItemWithEditorFlags = {
    ...currentItem,
    aspectRatioLock: nextAspectRatioLock,
  };
  let updatedItem;

  if (detail.name === "aspectRatioMode") {
    updatedItem = structuredClone(currentItem);
    if (detail.value === "fixed") {
      const currentWidth = Number(
        detail.formValues?.width ?? currentItem.width,
      );
      const currentHeight = Number(
        detail.formValues?.height ?? currentItem.height,
      );
      updatedItem.aspectRatioLock =
        Number.isFinite(currentWidth) &&
        Number.isFinite(currentHeight) &&
        currentWidth > 0 &&
        currentHeight > 0
          ? currentWidth / currentHeight
          : undefined;
    } else {
      delete updatedItem.aspectRatioLock;
    }
    delete updatedItem.aspectRatioMode;
  } else {
    if (detail.name === "spritesheetSelection") {
      const { resourceId, animationName } =
        parseSpritesheetAnimationSelectionValue(detail.value);
      updatedItem = {
        ...structuredClone(currentItemWithEditorFlags),
        resourceId,
        animationName,
      };
    } else {
      updatedItem = applyLayoutItemFieldChange({
        item: currentItemWithEditorFlags,
        name: detail.name,
        value: detail.value,
        imagesData: store.selectImages(),
      });
    }
  }

  if (
    (detail.name === "width" || detail.name === "height") &&
    Number.isFinite(detail.formValues?.aspectRatioLock) &&
    detail.formValues.aspectRatioLock > 0
  ) {
    const nextWidth = Number(detail.formValues.width);
    const nextHeight = Number(detail.formValues.height);

    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      updatedItem.width = Math.round(nextWidth);
    }

    if (Number.isFinite(nextHeight) && nextHeight > 0) {
      updatedItem.height = Math.round(nextHeight);
    }
  }

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
    const pendingPayload = queuePendingLayoutEditorPersist(store, {
      layoutId,
      resourceType,
      selectedItemId,
      updatedItem,
    });
    subject.dispatch("layoutEditor.updateElement", pendingPayload);
  }

  render();
};
