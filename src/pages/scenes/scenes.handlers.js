import { generateId, generatePrefixedId } from "../../internal/id.js";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import { createScenesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  SCENE_BOX_HEIGHT,
  SCENE_BOX_VIEWPORT_PADDING,
  SCENE_BOX_WIDTH,
} from "../../internal/whiteboard/constants.js";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another section.";
const DEFAULT_SCENES_MAP_VIEWPORT = {
  zoomLevel: 1.5,
  panX: -120,
  panY: -200,
};

const getProjectErrorMessage = (result, fallbackMessage) => {
  return (
    result?.error?.message ||
    result?.error?.creatorModelError?.message ||
    result?.message ||
    fallbackMessage
  );
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFiniteNumberOr = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

const parseNumericConfig = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const isViewportLikelyOffscreen = ({ items, zoomLevel, panX, panY }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  const viewportWidth = Number(window?.innerWidth) || 1200;
  const viewportHeight = Number(window?.innerHeight) || 800;
  const itemWidth = SCENE_BOX_WIDTH + SCENE_BOX_VIEWPORT_PADDING;
  const itemHeight = SCENE_BOX_HEIGHT + SCENE_BOX_VIEWPORT_PADDING;

  return items.every((item) => {
    const screenX = item.x * zoomLevel + panX;
    const screenY = item.y * zoomLevel + panY;
    return !(
      screenX + itemWidth > 0 &&
      screenX < viewportWidth &&
      screenY + itemHeight > 0 &&
      screenY < viewportHeight
    );
  });
};

const resolveInitialWhiteboardViewport = ({ appService, items }) => {
  const defaultViewport = {
    ...DEFAULT_SCENES_MAP_VIEWPORT,
    didReset: false,
  };

  const zoomLevel = clamp(
    parseNumericConfig(
      getViewportConfigValue({ appService, field: "zoomLevel" }),
      defaultViewport.zoomLevel,
    ),
    0.2,
    2,
  );
  const panX = parseNumericConfig(
    getViewportConfigValue({ appService, field: "panX" }),
    defaultViewport.panX,
  );
  const panY = parseNumericConfig(
    getViewportConfigValue({ appService, field: "panY" }),
    defaultViewport.panY,
  );

  if (isViewportLikelyOffscreen({ items, zoomLevel, panX, panY })) {
    return { ...defaultViewport, didReset: true };
  }

  return { zoomLevel, panX, panY, didReset: false };
};

const getOrderedSceneIds = (domainState) => {
  const domainScenes = domainState?.scenes || {};
  const fromDomainOrder = Array.isArray(domainState?.story?.sceneOrder)
    ? domainState.story.sceneOrder
    : [];
  const allSceneIds = Object.keys(domainScenes);
  const ordered = [...fromDomainOrder];
  for (const sceneId of allSceneIds) {
    if (!ordered.includes(sceneId)) {
      ordered.push(sceneId);
    }
  }
  return ordered.filter((sceneId) => !!domainScenes[sceneId]);
};

const buildSceneWhiteboardItems = ({
  domainState,
  repositoryState,
  sceneOverviewsById = {},
  currentWhiteboardItems = [],
}) => {
  const domainScenes = domainState?.scenes || {};
  const initialSceneId = domainState?.story?.initialSceneId || null;
  const repositoryScenesById = repositoryState?.scenes?.items || {};
  const orderedSceneIds = getOrderedSceneIds(domainState).filter(
    (sceneId) => domainScenes[sceneId]?.type !== "folder",
  );

  return orderedSceneIds.map((sceneId) => {
    const scene = domainScenes[sceneId] || {};
    const repositoryScene = repositoryScenesById[sceneId];
    const overview = sceneOverviewsById?.[sceneId];
    const existingWhiteboardItem = currentWhiteboardItems.find(
      (wb) => wb.id === sceneId,
    );

    return {
      id: sceneId,
      name: scene.name || repositoryScene?.name || `Scene ${sceneId}`,
      x: toFiniteNumberOr(
        scene.position?.x,
        toFiniteNumberOr(
          repositoryScene?.position?.x,
          existingWhiteboardItem?.x ?? 200,
        ),
      ),
      y: toFiniteNumberOr(
        scene.position?.y,
        toFiniteNumberOr(
          repositoryScene?.position?.y,
          existingWhiteboardItem?.y ?? 200,
        ),
      ),
      isInit: sceneId === initialSceneId,
      transitions: Array.isArray(overview?.outgoingSceneIds)
        ? [...overview.outgoingSceneIds]
        : [],
    };
  });
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const navigateToSceneEditor = ({ appService, sceneId, sectionId }) => {
  const currentPayload = appService.getPayload();
  const nextPayload = {
    ...currentPayload,
    s: sceneId,
  };
  delete nextPayload.sceneId;
  if (sectionId) {
    nextPayload.sectionId = sectionId;
  }
  appService.navigate("/project/scene-editor", nextPayload);
};

const getCurrentProjectId = (appService) => {
  return appService.getPayload()?.p;
};

const getViewportConfigKey = ({ appService, field } = {}) => {
  const projectId = getCurrentProjectId(appService);
  if (!projectId || !field) {
    return undefined;
  }

  return `scenesMap.viewportByProject.${projectId}.${field}`;
};

const getViewportConfigValue = ({ appService, field } = {}) => {
  const configKey = getViewportConfigKey({ appService, field });
  return configKey ? appService.getUserConfig(configKey) : undefined;
};

const persistViewport = ({ appService, zoomLevel, panX, panY } = {}) => {
  const zoomLevelKey = getViewportConfigKey({
    appService,
    field: "zoomLevel",
  });
  const panXKey = getViewportConfigKey({
    appService,
    field: "panX",
  });
  const panYKey = getViewportConfigKey({
    appService,
    field: "panY",
  });

  if (!zoomLevelKey || !panXKey || !panYKey) {
    return;
  }

  appService.setUserConfig(zoomLevelKey, zoomLevel);
  appService.setUserConfig(panXKey, panX);
  appService.setUserConfig(panYKey, panY);
};

const getPersistedSelectedSceneId = ({ appService, sceneItems } = {}) => {
  const projectId = getCurrentProjectId(appService);
  if (!projectId) {
    return undefined;
  }

  const persistedSceneId = appService.getUserConfig(
    `scenesMap.selectedSceneIdByProject.${projectId}`,
  );
  if (typeof persistedSceneId !== "string" || persistedSceneId.length === 0) {
    return undefined;
  }

  const hasScene = Array.isArray(sceneItems)
    ? sceneItems.some((item) => item?.id === persistedSceneId)
    : false;
  return hasScene ? persistedSceneId : undefined;
};

const persistSelectedSceneId = ({ appService, sceneId } = {}) => {
  const projectId = getCurrentProjectId(appService);
  if (!projectId) {
    return;
  }

  const nextSceneId =
    typeof sceneId === "string" && sceneId.length > 0 ? sceneId : undefined;
  appService.setUserConfig(
    `scenesMap.selectedSceneIdByProject.${projectId}`,
    nextSceneId,
  );
};

const setSelectedScene = ({ store, appService, sceneId } = {}) => {
  store.setSelectedItemId({ itemId: sceneId });
  persistSelectedSceneId({ appService, sceneId });
};

const dismissMapAddHint = ({ store, appService } = {}) => {
  store.hideMapAddHint();
  appService.setUserConfig("scenesMap.hideAddSceneHint", true);
};

const getSceneItemById = ({ store, sceneId } = {}) => {
  if (!sceneId) {
    return undefined;
  }

  const scenesData = store.selectScenesData();
  const sceneItem = scenesData?.items?.[sceneId];
  if (sceneItem?.type !== "scene") {
    return undefined;
  }
  return sceneItem;
};

const resolveSceneFormDefaultValues = ({ store } = {}) => {
  const scenesData = store.selectScenesData() ?? { tree: [], items: {} };
  const defaultFolderId = toFlatItems(scenesData).find(
    (item) => item.type === "folder",
  )?.id;

  return {
    name: "",
    folderId: defaultFolderId,
  };
};

const openSceneForm = ({
  deps,
  formPosition,
  whiteboardPosition,
  isWaitingForTransform = false,
} = {}) => {
  const { store, render, refs } = deps;
  const sceneFormValues = resolveSceneFormDefaultValues({ store });

  store.setSceneFormData({ data: sceneFormValues });
  store.setSceneFormPosition({
    position: formPosition,
  });
  store.setSceneWhiteboardPosition({
    position: whiteboardPosition,
  });
  store.setWaitingForTransform({ isWaiting: isWaitingForTransform });
  store.setShowSceneForm({ show: true });
  render();

  const { sceneForm } = refs;
  sceneForm.reset();
  sceneForm.setValues({ values: sceneFormValues });
};

const syncScenesState = async ({ store, projectService } = {}) => {
  const repositoryState = projectService.getRepositoryState();
  const domainState = projectService.getDomainState();
  const sceneData = repositoryState?.scenes ?? { tree: [], items: {} };
  const layoutsData = repositoryState?.layouts ?? { tree: [], items: {} };
  const currentWhiteboardItems = store.selectWhiteboardItems() ?? [];
  const orderedSceneIds = getOrderedSceneIds(domainState).filter(
    (sceneId) => domainState?.scenes?.[sceneId]?.type !== "folder",
  );
  const sceneOverviewsById = await projectService.loadSceneOverviews({
    sceneIds: orderedSceneIds,
  });
  const sceneItems = buildSceneWhiteboardItems({
    domainState,
    repositoryState,
    sceneOverviewsById,
    currentWhiteboardItems,
  });

  store.setItems({ scenesData: sceneData });
  store.setLayouts({ layoutsData });
  store.setSceneOverviews({ sceneOverviewsById });
  store.setWhiteboardItems({ items: sceneItems });
};

const openEditDialogWithValues = ({ deps, sceneId } = {}) => {
  const { store, refs, render, appService } = deps;
  if (!sceneId) {
    return;
  }

  const sceneItem = getSceneItemById({ store, sceneId });
  if (!sceneItem) {
    return;
  }

  const editValues = {
    name: sceneItem.name ?? "",
    description: sceneItem.description ?? "",
  };

  setSelectedScene({ store, appService, sceneId });
  const { fileexplorer, editForm } = refs;
  fileexplorer.selectItem({ itemId: sceneId });
  store.openEditDialog({
    itemId: sceneId,
    defaultValues: editValues,
  });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

export const handleBeforeMount = (deps) => {
  const subscription = createCollabRemoteRefreshStream({
    deps,
    matches: matchesRemoteTargets(["scenes", "layouts", "story"]),
    refresh: refreshScenesData,
  }).subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, refs, appService } = deps;
  await projectService.ensureRepository();
  await syncScenesState({ store, projectService });
  const sceneItems = store.selectWhiteboardItems() ?? [];

  const shouldHideMapAddHint =
    appService.getUserConfig("scenesMap.hideAddSceneHint") === true;
  if (shouldHideMapAddHint) {
    store.hideMapAddHint();
  }

  const persistedSelectedSceneId = getPersistedSelectedSceneId({
    appService,
    sceneItems,
  });
  if (persistedSelectedSceneId) {
    setSelectedScene({
      store,
      appService,
      sceneId: persistedSelectedSceneId,
    });
    const { fileexplorer } = refs;
    fileexplorer.selectItem({ itemId: persistedSelectedSceneId });
  }

  const initialViewport = resolveInitialWhiteboardViewport({
    appService,
    items: sceneItems,
  });

  const { whiteboard } = refs;

  whiteboard.transformedHandlers.handleInitialZoomAndPanSetup({
    panX: initialViewport.panX,
    panY: initialViewport.panY,
    zoomLevel: initialViewport.zoomLevel,
  });

  if (initialViewport.didReset) {
    persistViewport({
      appService,
      zoomLevel: initialViewport.zoomLevel,
      panX: initialViewport.panX,
      panY: initialViewport.panY,
    });
  }

  render();
};

export const handleSetInitialScene = async (sceneId, deps) => {
  const { projectService } = deps;
  await projectService.setInitialScene({ sceneId });
};

const refreshScenesData = async (deps) => {
  const { store, render, projectService } = deps;
  await syncScenesState({ store, projectService });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createScenesFileExplorerHandlers({
    refresh: refreshScenesData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshScenesData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render, appService } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  const isFolder = detail.isFolder === true || detail.item?.type === "folder";

  if (isFolder) {
    setSelectedScene({ store, appService, sceneId: undefined });
    render();
    return;
  }

  if (!itemId) {
    return;
  }

  setSelectedScene({ store, appService, sceneId: itemId });
  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, appService } = deps;
  const detail = payload?._event?.detail ?? {};
  const itemId = resolveDetailItemId(detail);
  const isFolder =
    detail.isFolder === true ||
    detail.item?.type === "folder" ||
    detail.itemType === "folder";

  if (isFolder || !itemId) {
    return;
  }

  setSelectedScene({ store, appService, sceneId: itemId });
  navigateToSceneEditor({ appService, sceneId: itemId });
};

export const handleFileExplorerClickItem = (deps) => {
  const { appService } = deps;
  const currentPayload = appService.getPayload();
  appService.navigate("/project/scene-editor", currentPayload);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const handleWhiteboardItemPositionUpdating = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, x, y } = payload._event.detail;

  // Only update local whiteboard state for real-time feedback
  // Don't update repository during drag (too expensive)
  store.updateItemPosition({ itemId, x, y });
  render();
};

export const handleWhiteboardItemPositionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, x, y } = payload._event.detail;
  const nextX = Number(x);
  const nextY = Number(y);

  if (!itemId || !Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    console.error("[scenes] invalid position payload from whiteboard", {
      itemId,
      x,
      y,
    });
    return;
  }

  const currentScene = store.selectScenesData()?.items?.[itemId];
  const currentX = Number(currentScene?.position?.x);
  const currentY = Number(currentScene?.position?.y);

  if (currentX === nextX && currentY === nextY) {
    return;
  }

  await projectService.updateSceneItem({
    sceneId: itemId,
    data: {
      position: { x: nextX, y: nextY },
    },
  });

  // Keep local UI and the last persisted scene snapshot aligned.
  store.updatePersistedScenePosition({ itemId, x: nextX, y: nextY });
  store.updateItemPosition({ itemId, x: nextX, y: nextY });
  render();
};

export const handleWhiteboardItemSelected = (deps, payload) => {
  const { store, render, appService } = deps;
  const { itemId } = payload._event.detail;

  // Update selected item for detail panel
  setSelectedScene({ store, appService, sceneId: itemId });
  render();
};

export const handleWhiteboardItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId } = payload._event.detail;

  if (!itemId) {
    console.error("ERROR: itemId is missing in double-click event");
    return;
  }

  navigateToSceneEditor({ appService, sceneId: itemId });
};

export const handleAddSceneClick = (deps) => {
  const { store, render } = deps;

  // Start waiting for transform
  store.setWaitingForTransform({ isWaiting: true });
  render();
};

export const handleWhiteboardClick = (deps, payload) => {
  const { store } = deps;
  const isWaitingForTransform = store.selectIsWaitingForTransform();

  if (isWaitingForTransform) {
    // Get click position relative to whiteboard
    const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;
    openSceneForm({
      deps,
      formPosition: { x: formX, y: formY },
      whiteboardPosition: { x: whiteboardX, y: whiteboardY },
      isWaitingForTransform: false,
    });
  }
};

export const handleWhiteboardCanvasContextMenu = (deps, payload) => {
  const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;
  openSceneForm({
    deps,
    formPosition: { x: formX, y: formY },
    whiteboardPosition: { x: whiteboardX, y: whiteboardY },
  });
};

export const handleSceneFormClose = (deps) => {
  const { store, render } = deps;
  store.resetSceneForm();
  render();
};

export const handleSceneFormAction = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const actionId = payload._event.detail.actionId;

  if (actionId === "cancel") {
    store.resetSceneForm();
    render();
  } else if (actionId === "submit") {
    if (!store.getState().showSceneForm) {
      return;
    }

    const sceneWhiteboardPosition = store.selectSceneWhiteboardPosition() || {
      x: 0,
      y: 0,
    };

    // Get form values from the event detail (same pattern as text styles)
    const formData = payload._event.detail.values;

    store.resetSceneForm();
    render();

    // Use a simple ID generator instead of nanoid
    const newSceneId = generatePrefixedId("scene-");

    const sectionId = generateId();
    const stepId = generateId();

    // Get repository resources to find first dialogue layout and control
    const { layouts, controls } = projectService.getRepositoryState();
    let dialogueLayoutId = null;
    let controlId = null;

    if (layouts && layouts.items) {
      // Find first dialogue layout
      for (const [layoutId, layout] of Object.entries(layouts.items)) {
        if (!dialogueLayoutId && layout.layoutType === "dialogue-adv") {
          dialogueLayoutId = layoutId;
        }
        if (dialogueLayoutId) {
          break;
        }
      }
    }

    if (controls && controls.items) {
      for (const [itemId, control] of Object.entries(controls.items)) {
        if (control.type === "control") {
          controlId = itemId;
          break;
        }
      }
    }

    // Create actions object with dialogue and control layouts if found
    const actions = {
      dialogue: dialogueLayoutId
        ? {
            ui: {
              resourceId: dialogueLayoutId,
            },
            mode: "adv",
            content: [{ text: "" }],
          }
        : {
            mode: "adv",
            content: [{ text: "" }],
          },
    };

    if (controlId) {
      actions.control = {
        resourceId: controlId,
        resourceType: "control",
      };
    }

    try {
      await projectService.createSceneItem({
        sceneId: newSceneId,
        parentId: formData.folderId || null,
        position: "last",
        data: {
          name: formData.name || `Scene ${new Date().toLocaleTimeString()}`,
          position: {
            x: sceneWhiteboardPosition.x,
            y: sceneWhiteboardPosition.y,
          },
        },
      });
      await projectService.createSectionItem({
        sceneId: newSceneId,
        sectionId,
        position: "last",
        data: {
          name: "Section 1",
        },
      });
      await projectService.createLineItem({
        sectionId,
        lineId: stepId,
        data: {
          actions,
        },
        position: "last",
      });

      // Add to whiteboard items for visual display
      store.addWhiteboardItem({
        newItem: {
          id: newSceneId,
          name: formData.name,
          x: sceneWhiteboardPosition.x,
          y: sceneWhiteboardPosition.y,
        },
      });
      dismissMapAddHint({ store, appService });

      await refreshScenesData(deps);
      render();
    } catch (error) {
      appService.showAlert({
        message: getProjectErrorMessage(error, "Failed to create scene."),
      });
      await refreshScenesData(deps);
      render();
    }
  }
};

export const handleWhiteboardItemDelete = async (deps, payload) => {
  const { store, projectService, appService } = deps;
  const { itemId } = payload._event.detail;

  await projectService.deleteSceneItem({ sceneIds: [itemId] });

  // Clear selection if the deleted item was selected
  const selectedItemId = store.selectSelectedItemId();
  if (selectedItemId === itemId) {
    setSelectedScene({ store, appService, sceneId: undefined });
  }
  await refreshScenesData(deps);
};

export const handleWhiteboardItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, x, y } = payload._event.detail;

  // Show dropdown menu at the provided position
  store.showDropdownMenu({
    position: { x, y },
    itemId,
  });

  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleMapAddHintClose = (deps) => {
  const { store, render, appService } = deps;
  dismissMapAddHint({ store, appService });
  render();
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  openEditDialogWithValues({ deps, sceneId: selectedItemId });
};

export const handleDetailPreviewClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  store.showPreviewSceneId({ sceneId: selectedItemId });
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const detail = payload._event.detail;
  const itemId = store.selectDropdownMenuItemId();

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  if (item.value === "open-item" && itemId) {
    navigateToSceneEditor({ appService, sceneId: itemId });
    return;
  }

  if (item.value === "preview-item" && itemId) {
    store.showPreviewSceneId({ sceneId: itemId });
    render();
    return;
  }

  if (item.value === "edit-item" && itemId) {
    openEditDialogWithValues({ deps, sceneId: itemId });
    return;
  }

  // Handle set initial scene action
  if (item.value === "set-initial" && itemId) {
    await projectService.setInitialScene({ sceneId: itemId });
    await refreshScenesData(deps);
  }

  // Handle delete action
  if (item.value === "delete-item" && itemId) {
    await projectService.deleteSceneItem({ sceneIds: [itemId] });

    // Clear selection if the deleted item was selected
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId === itemId) {
      setSelectedScene({ store, appService, sceneId: undefined });
    }
    await refreshScenesData(deps);
  }
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, appService, projectService } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Scene name is required.",
      title: "Warning",
    });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const updateResult = await projectService.updateSceneItem({
    sceneId: editItemId,
    data: {
      name,
      description: values?.description ?? "",
    },
  });

  if (updateResult?.valid === false) {
    appService.showAlert({
      message: getProjectErrorMessage(updateResult, "Failed to update scene."),
      title: "Error",
    });
    return;
  }

  store.closeEditDialog();
  await refreshScenesData(deps);
};

export const handleSectionsListToggle = (deps) => {
  const { store, render } = deps;
  store.toggleSectionsList();
  store.hideDeadEndTooltip();
  render();
};

export const handleDeadEndWarningMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showDeadEndTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    content: DEAD_END_TOOLTIP_CONTENT,
  });
  render();
};

export const handleDeadEndWarningMouseLeave = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  render();
};

export const handleSectionsListItemClick = (deps, payload) => {
  const { appService } = deps;
  const sceneId = payload._event.currentTarget.dataset.sceneId;
  const sectionId = payload._event.currentTarget.dataset.sectionId;

  if (!sceneId || !sectionId) {
    return;
  }

  navigateToSceneEditor({ appService, sceneId, sectionId });
};

export const handleWhiteboardZoomChanged = (deps, payload) => {
  const { appService } = deps;
  const { zoomLevel } = payload._event.detail;
  const configKey = getViewportConfigKey({
    appService,
    field: "zoomLevel",
  });
  if (!configKey) {
    return;
  }

  appService.setUserConfig(configKey, zoomLevel);
};

export const handleWhiteboardPanChanged = (deps, payload) => {
  const { appService } = deps;
  const { panX, panY } = payload._event.detail;
  const panXKey = getViewportConfigKey({
    appService,
    field: "panX",
  });
  const panYKey = getViewportConfigKey({
    appService,
    field: "panY",
  });
  if (!panXKey || !panYKey) {
    return;
  }

  appService.setUserConfig(panXKey, panX);
  appService.setUserConfig(panYKey, panY);
};
