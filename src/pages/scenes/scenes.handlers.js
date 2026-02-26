import { nanoid } from "nanoid";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another scene.";

/**
 * Extract transitions from layout element click actions
 * @param {Object} layout - Layout object with elements
 * @returns {Array} Array of sceneIds found in click actions
 */
const getTransitionsFromLayout = (layout) => {
  const transitions = [];
  if (!layout?.elements?.items) return transitions;

  for (const element of Object.values(layout.elements.items)) {
    const sceneId =
      element.click?.actionPayload?.actions?.sectionTransition?.sceneId;
    if (sceneId && !transitions.includes(sceneId)) {
      transitions.push(sceneId);
    }
  }
  return transitions;
};

/**
 *
 * @param {Object} sections
 * @param {Object} layouts - Layouts data from repository
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
const getTransitionsForScene = (sections, layouts) => {
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

        // Check for transitions within layouts referenced by background or base
        const layoutRefs = [
          line.actions?.background,
          line.actions?.base,
          line.actions?.actions?.background,
          line.actions?.actions?.base,
        ].filter((ref) => ref?.resourceType === "layout" && ref?.resourceId);

        for (const ref of layoutRefs) {
          const layout = layouts?.items?.[ref.resourceId];
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
  const orderedSceneIds = getOrderedSceneIds(domainState);
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
      transitions: getTransitionsForScene(repositoryScene?.sections, layouts),
    };
  });
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, refs, appService } = deps;
  await projectService.ensureRepository();
  const repositoryState = projectService.getState();
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

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const repositoryState = projectService.getState();
  const domainState = projectService.getDomainState();
  const { scenes, layouts } = repositoryState;
  const sceneData = scenes || { tree: [], items: {} };

  // Get current whiteboard items to preserve positions during updates
  const currentWhiteboardItems = store.selectWhiteboardItems() || [];

  const sceneItems = buildSceneWhiteboardItems({
    domainState,
    repositoryState,
    currentWhiteboardItems,
  });

  // Update both scenes data and whiteboard items
  store.setItems({ scenesData: sceneData });
  store.setLayouts({ layoutsData: layouts });
  store.setWhiteboardItems({ items: sceneItems });
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  const isFolder = detail.isFolder === true || detail.item?.type === "folder";

  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    render();
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
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
    patch: {
      position: { x: nextX, y: nextY },
    },
  });

  // Update local whiteboard state (already updated by position-updating, but keeping for consistency)
  store.updateItemPosition({ itemId, x: nextX, y: nextY });
  render();
};

export const handleWhiteboardItemSelected = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;

  // Update selected item for detail panel
  store.setSelectedItemId({ itemId: itemId });
  render();
};

export const handleWhiteboardItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId } = payload._event.detail;

  if (!itemId) {
    console.error("ERROR: itemId is missing in double-click event");
    return;
  }

  // Redirect to scene editor with sceneId in payload
  const currentPayload = appService.getPayload();
  appService.navigate("/project/scene-editor", {
    ...currentPayload,
    sceneId: itemId,
  });
};

export const handleAddSceneClick = (deps) => {
  const { store, render } = deps;

  // Start waiting for transform
  store.setWaitingForTransform({ isWaiting: true });
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.updateSceneItem({
    sceneId: store.selectSelectedItemId(),
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { scenes } = projectService.getState();
  store.setItems({ scenesData: scenes });
  render();
};

export const handleWhiteboardClick = (deps, payload) => {
  const { store, render } = deps;
  const isWaitingForTransform = store.selectIsWaitingForTransform();

  if (isWaitingForTransform) {
    // Get click position relative to whiteboard
    const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;

    // Reset form data
    store.setSceneFormData({ name: "", folderId: "_root" });

    // Show the form at the clicked position
    store.setSceneFormPosition({ x: formX, y: formY });
    store.setSceneWhiteboardPosition({ x: whiteboardX, y: whiteboardY });
    store.setWaitingForTransform({ isWaiting: false });
    store.setShowSceneForm({ show: true });
    render();
  }
};

export const handleWhiteboardCanvasContextMenu = (deps, payload) => {
  const { store, render } = deps;
  const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;

  // Reset form data
  store.setSceneFormData({ name: "", folderId: "_root" });

  // Show the form at the right-clicked position
  store.setSceneFormPosition({ x: formX, y: formY });
  store.setSceneWhiteboardPosition({ x: whiteboardX, y: whiteboardY });
  store.setShowSceneForm({ show: true });
  render();
};

export const handleSceneFormClose = (deps) => {
  const { store, render } = deps;
  store.resetSceneForm();
  render();
};

export const handleSceneFormAction = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const actionId = payload._event.detail.actionId;

  if (actionId === "cancel") {
    store.resetSceneForm();
    render();
  } else if (actionId === "submit") {
    const sceneWhiteboardPosition = store.selectSceneWhiteboardPosition();

    // Get form values from the event detail (same pattern as typography)
    const formData = payload._event.detail.values;

    // Use a simple ID generator instead of nanoid
    const newSceneId = `scene-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const sectionId = nanoid();
    const stepId = nanoid();

    // Generate 31 additional line IDs
    const additionalLineIds = Array.from({ length: 31 }, () => nanoid());

    // Get layouts from repository to find first dialogue and base layouts
    const { layouts } = projectService.getState();
    let dialogueLayoutId = null;
    let baseLayoutId = null;

    if (layouts && layouts.items) {
      // Find first layout with layoutType: "dialogue" and "base"
      for (const [layoutId, layout] of Object.entries(layouts.items)) {
        if (!dialogueLayoutId && layout.layoutType === "dialogue") {
          dialogueLayoutId = layoutId;
        }
        if (!baseLayoutId && layout.layoutType === "base") {
          baseLayoutId = layoutId;
        }
        if (dialogueLayoutId && baseLayoutId) {
          break;
        }
      }
    }

    // Create actions object with dialogue and base layouts if found
    const actions = {
      dialogue: dialogueLayoutId
        ? {
            gui: {
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

    if (baseLayoutId) {
      actions.base = {
        resourceId: baseLayoutId,
        resourceType: "layout",
      };
    }

    // Create items object with first line having actions, rest with empty actions
    const lineItems = {
      [stepId]: {
        actions: actions,
      },
    };

    // Add 31 lines with empty actions
    additionalLineIds.forEach((lineId) => {
      lineItems[lineId] = {
        actions: {},
      };
    });

    await projectService.createSceneItem({
      sceneId: newSceneId,
      name: formData.name || `Scene ${new Date().toLocaleTimeString()}`,
      parentId: formData.folderId || null,
      position: "last",
      data: {
        position: {
          x: sceneWhiteboardPosition.x,
          y: sceneWhiteboardPosition.y,
        },
      },
    });
    await projectService.createSectionItem({
      sceneId: newSceneId,
      sectionId,
      name: "Section New",
      position: "last",
    });

    const allLineIds = [stepId, ...additionalLineIds];
    let previousLineId = null;
    for (const currentLineId of allLineIds) {
      await projectService.createLineItem({
        sectionId,
        lineId: currentLineId,
        line: lineItems[currentLineId] || { actions: {} },
        afterLineId: previousLineId,
      });
      previousLineId = currentLineId;
    }

    // Add to whiteboard items for visual display
    store.addWhiteboardItem({
      id: newSceneId,
      name: formData.name,
      x: sceneWhiteboardPosition.x,
      y: sceneWhiteboardPosition.y,
    });

    // Update store with new scenes data
    const { scenes: updatedScenes } = projectService.getState();
    store.setItems({ scenesData: updatedScenes });

    // Reset form
    store.resetSceneForm();

    render();
  }
};

export const handleWhiteboardItemDelete = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId } = payload._event.detail;

  await projectService.deleteSceneItem({ sceneId: itemId });

  // Update store with new scenes data
  const { scenes: updatedScenes } = projectService.getState();
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
    store.setSelectedItemId({ itemId: null });
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

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload._event.detail;
  const itemId = store.selectDropdownMenuItemId();

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  // Handle set initial scene action
  if (item.value === "set-initial" && itemId) {
    await projectService.setInitialScene({ sceneId: itemId });

    // Get updated scenes data
    const { scenes: updatedScenes, story } = projectService.getState();
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
    await projectService.deleteSceneItem({ sceneId: itemId });

    // Update store with new scenes data
    const { scenes: updatedScenes } = projectService.getState();
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
      store.setSelectedItemId({ itemId: null });
    }

    render();
  }
};

export const handleClickShowScenePreview = (deps, payload) => {
  const { store, render } = deps;
  store.showPreviewSceneId({ sceneId: payload._event.target.dataset.sceneId });
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

  const currentPayload = appService.getPayload();
  appService.navigate("/project/scene-editor", {
    ...currentPayload,
    sceneId,
    sectionId,
  });
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
