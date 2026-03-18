import { nanoid } from "nanoid";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import { createScenesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { getInteractionActions } from "../../internal/project/interactionPayload.js";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another scene.";

/**
 * Extract transitions from layout element click and right-click actions
 * @param {Object} layout - Layout object with elements
 * @returns {Array} Array of sceneIds found in click actions
 */
const getTransitionsFromLayout = (layout) => {
  const transitions = [];
  if (!layout?.elements?.items) return transitions;

  for (const element of Object.values(layout.elements.items)) {
    const sceneIds = [
      getInteractionActions(element.click).sectionTransition?.sceneId,
      getInteractionActions(element.rightClick).sectionTransition?.sceneId,
    ];

    for (const sceneId of sceneIds) {
      if (sceneId && !transitions.includes(sceneId)) {
        transitions.push(sceneId);
      }
    }
  }
  return transitions;
};

/**
 *
 * @param {Object} sections
 * @param {Object} layouts - Layouts data from repository
 * @param {Object} controls - Controls data from repository
 * @returns {Array} Array of transition objects with sceneId
 * @example
 * // should return: ["scene-1760679405214-0ueot8rb4"]
 * const sections = {
 *   "items": {
 *     "section-main": {
 *       "name": "Section New",
 *       "lines": {
 *         "items": {
 *           "line-2": {
 *             "actions": {
 *               "sectionTransition": {
 *                 "sceneId": "scene-1760679405214-0ueot8rb4",
 *                 "sectionId": "myCeTAvUhyCRHnyMx8Ua8",
 *                 "animation": "fade"
 *               }
 *             }
 *           },
 *         },
 *         "tree": []
 *       }
 *     }
 *   }
 * }
 *
 */
const getTransitionsForScene = (sections, layouts, controls) => {
  if (!sections || !sections.items) {
    return [];
  }

  const transitions = [];

  // Iterate through all sections
  for (const section of Object.values(sections.items)) {
    if (section.lines && section.lines.items) {
      // Iterate through all lines in this section
      for (const line of Object.values(section.lines.items)) {
        // Check for sectionTransition in actions
        const sectionTransition =
          line.actions?.sectionTransition ||
          line.actions?.actions?.sectionTransition;
        if (
          sectionTransition &&
          sectionTransition.sceneId &&
          !transitions.includes(sectionTransition.sceneId)
        ) {
          transitions.push(sectionTransition.sceneId);
        }

        // Check for transitions within choices
        const choice = line.actions?.choice || line.actions?.actions?.choice;
        if (choice && choice.items && Array.isArray(choice.items)) {
          for (const choiceItem of choice.items) {
            const choiceTransition =
              choiceItem.events?.click?.actions?.sectionTransition;
            if (
              choiceTransition &&
              choiceTransition.sceneId &&
              !transitions.includes(choiceTransition.sceneId)
            ) {
              transitions.push(choiceTransition.sceneId);
            }
          }
        }

        // Check for transitions within layouts referenced by background or control
        const layoutRefs = [
          line.actions?.background,
          line.actions?.control,
          line.actions?.actions?.background,
          line.actions?.actions?.control,
        ].filter((ref) => {
          return (
            ref?.resourceId &&
            (ref.resourceType === "layout" || ref.resourceType === "control")
          );
        });

        for (const ref of layoutRefs) {
          const layout =
            ref.resourceType === "control"
              ? controls?.items?.[ref.resourceId]
              : layouts?.items?.[ref.resourceId];
          if (layout) {
            const layoutTransitions = getTransitionsFromLayout(layout);
            for (const sceneId of layoutTransitions) {
              if (!transitions.includes(sceneId)) {
                transitions.push(sceneId);
              }
            }
          }
        }
      }
    }
  }

  return transitions;
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
  const itemWidth = 140;
  const itemHeight = 80;

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
  const defaultViewport = { zoomLevel: 1, panX: 0, panY: 0, didReset: false };

  const zoomLevel = clamp(
    parseNumericConfig(appService.getUserConfig("scenesMap.zoomLevel"), 1),
    0.2,
    2,
  );
  const panX = parseNumericConfig(
    appService.getUserConfig("scenesMap.panX"),
    0,
  );
  const panY = parseNumericConfig(
    appService.getUserConfig("scenesMap.panY"),
    0,
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
  currentWhiteboardItems = [],
}) => {
  const domainScenes = domainState?.scenes || {};
  const initialSceneId = domainState?.story?.initialSceneId || null;
  const repositoryScenesById = repositoryState?.scenes?.items || {};
  const orderedSceneIds = getOrderedSceneIds(domainState).filter(
    (sceneId) => domainScenes[sceneId]?.type !== "folder",
  );
  const layouts = repositoryState?.layouts;

  return orderedSceneIds.map((sceneId) => {
    const scene = domainScenes[sceneId] || {};
    const repositoryScene = repositoryScenesById[sceneId];
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
      transitions: getTransitionsForScene(
        repositoryScene?.sections,
        layouts,
        repositoryState.controls,
      ),
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

const syncScenesState = ({ store, projectService } = {}) => {
  const repositoryState = projectService.getRepositoryState();
  const domainState = projectService.getDomainState();
  const sceneData = repositoryState?.scenes ?? { tree: [], items: {} };
  const layoutsData = repositoryState?.layouts ?? { tree: [], items: {} };
  const currentWhiteboardItems = store.selectWhiteboardItems() ?? [];
  const sceneItems = buildSceneWhiteboardItems({
    domainState,
    repositoryState,
    currentWhiteboardItems,
  });

  store.setItems({ scenesData: sceneData });
  store.setLayouts({ layoutsData });
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
  const repositoryState = projectService.getRepositoryState();
  const domainState = projectService.getDomainState();
  const { scenes, layouts } = repositoryState;
  const scenesData = scenes || { tree: [], items: {} };

  // Set the scenes data
  store.setItems({ scenesData: scenesData });
  store.setLayouts({ layoutsData: layouts });

  const sceneItems = buildSceneWhiteboardItems({
    domainState,
    repositoryState,
  });

  // Initialize whiteboard with scene items only
  store.setWhiteboardItems({ items: sceneItems });

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
    appService.setUserConfig("scenesMap.zoomLevel", initialViewport.zoomLevel);
    appService.setUserConfig("scenesMap.panX", initialViewport.panX);
    appService.setUserConfig("scenesMap.panY", initialViewport.panY);
  }

  render();
};

export const handleSetInitialScene = async (sceneId, deps) => {
  const { projectService } = deps;
  await projectService.setInitialScene({ sceneId });
};

const refreshScenesData = async (deps) => {
  const { store, render, projectService } = deps;
  syncScenesState({ store, projectService });
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

  await projectService.updateSceneItem({
    sceneId: itemId,
    data: {
      position: { x: nextX, y: nextY },
    },
  });

  // Update local whiteboard state (already updated by position-updating, but keeping for consistency)
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

export const handleOpenSceneClick = (deps, payload) => {
  const { appService } = deps;
  const sceneId = payload?._event?.currentTarget?.dataset?.sceneId;

  if (!sceneId) {
    return;
  }

  navigateToSceneEditor({ appService, sceneId });
};

export const handleAddSceneClick = (deps) => {
  const { store, render } = deps;

  // Start waiting for transform
  store.setWaitingForTransform({ isWaiting: true });
  render();
};

export const handleWhiteboardClick = (deps, payload) => {
  const { store, render } = deps;
  const isWaitingForTransform = store.selectIsWaitingForTransform();

  if (isWaitingForTransform) {
    // Get click position relative to whiteboard
    const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;

    // Reset form data
    store.setSceneFormData({ data: { name: "", folderId: "_root" } });

    // Show the form at the clicked position
    store.setSceneFormPosition({
      position: { x: formX, y: formY },
    });
    store.setSceneWhiteboardPosition({
      position: { x: whiteboardX, y: whiteboardY },
    });
    store.setWaitingForTransform({ isWaiting: false });
    store.setShowSceneForm({ show: true });
    render();
  }
};

export const handleWhiteboardCanvasContextMenu = (deps, payload) => {
  const { store, render } = deps;
  const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;

  // Reset form data
  store.setSceneFormData({ data: { name: "", folderId: "_root" } });

  // Show the form at the right-clicked position
  store.setSceneFormPosition({
    position: { x: formX, y: formY },
  });
  store.setSceneWhiteboardPosition({
    position: { x: whiteboardX, y: whiteboardY },
  });
  store.setShowSceneForm({ show: true });
  render();
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
    const sceneWhiteboardPosition = store.selectSceneWhiteboardPosition() || {
      x: 0,
      y: 0,
    };

    // Get form values from the event detail (same pattern as text styles)
    const formData = payload._event.detail.values;

    // Use a simple ID generator instead of nanoid
    const newSceneId = `scene-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const sectionId = nanoid();
    const stepId = nanoid();

    // Get repository resources to find first dialogue layout and control
    const { layouts, controls } = projectService.getRepositoryState();
    let dialogueLayoutId = null;
    let controlId = null;

    if (layouts && layouts.items) {
      // Find first dialogue layout
      for (const [layoutId, layout] of Object.entries(layouts.items)) {
        if (!dialogueLayoutId && layout.layoutType === "dialogue") {
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
        name: "Section New",
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

    // Update store with new scenes data
    const { scenes: updatedScenes } = projectService.getRepositoryState();
    store.setItems({ scenesData: updatedScenes });

    // Reset form
    store.resetSceneForm();

    render();
  }
};

export const handleWhiteboardItemDelete = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { itemId } = payload._event.detail;

  await projectService.deleteSceneItem({ sceneIds: [itemId] });

  // Update store with new scenes data
  const { scenes: updatedScenes } = projectService.getRepositoryState();
  store.setItems({ scenesData: updatedScenes });

  // Remove from whiteboard items
  const currentWhiteboardItems = store.selectWhiteboardItems();
  const updatedWhiteboardItems = currentWhiteboardItems.filter(
    (item) => item.id !== itemId,
  );
  store.setWhiteboardItems({ items: updatedWhiteboardItems });

  // Clear selection if the deleted item was selected
  const selectedItemId = store.selectSelectedItemId();
  if (selectedItemId === itemId) {
    setSelectedScene({ store, appService, sceneId: undefined });
  }

  render();
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

    // Get updated scenes data
    const { scenes: updatedScenes, story } =
      projectService.getRepositoryState();
    store.setItems({ scenesData: updatedScenes });

    // Update whiteboard items with new colors
    const currentWhiteboardItems = store.selectWhiteboardItems();
    const initialSceneId = story?.initialSceneId;
    const updatedWhiteboardItems = currentWhiteboardItems.map((item) => ({
      ...item,
      isInit: item.id === initialSceneId,
    }));
    store.setWhiteboardItems({ items: updatedWhiteboardItems });

    render();
  }

  // Handle delete action
  if (item.value === "delete-item" && itemId) {
    await projectService.deleteSceneItem({ sceneIds: [itemId] });

    // Update store with new scenes data
    const { scenes: updatedScenes } = projectService.getRepositoryState();
    store.setItems({ scenesData: updatedScenes });

    // Remove from whiteboard items
    const currentWhiteboardItems = store.selectWhiteboardItems();
    const updatedWhiteboardItems = currentWhiteboardItems.filter(
      (item) => item.id !== itemId,
    );
    store.setWhiteboardItems({ items: updatedWhiteboardItems });

    // Clear selection if the deleted item was selected
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId === itemId) {
      setSelectedScene({ store, appService, sceneId: undefined });
    }

    render();
  }
};

export const handleClickShowScenePreview = (deps, payload) => {
  const { store, render } = deps;
  store.showPreviewSceneId({ sceneId: payload._event.target.dataset.sceneId });
  render();
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
    appService.showToast("Scene name is required.", { title: "Warning" });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  await projectService.updateSceneItem({
    sceneId: editItemId,
    data: {
      name,
      description: values?.description ?? "",
    },
  });

  syncScenesState({ store, projectService });
  store.closeEditDialog();
  render();
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
  appService.setUserConfig("scenesMap.zoomLevel", zoomLevel);
};

export const handleWhiteboardPanChanged = (deps, payload) => {
  const { appService } = deps;
  const { panX, panY } = payload._event.detail;
  appService.setUserConfig("scenesMap.panX", panX);
  appService.setUserConfig("scenesMap.panY", panY);
};
