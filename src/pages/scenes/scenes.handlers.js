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

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, refs, appService } = deps;
  await projectService.ensureRepository();
  const { scenes, story, layouts } = projectService.getState();
  const scenesData = scenes || { tree: [], items: {} };

  // Set the scenes data
  store.setItems({ scenesData: scenesData });
  store.setLayouts({ layoutsData: layouts });

  // Transform only scene items (not folders) into whiteboard items
  const initialSceneId = story?.initialSceneId;
  const sceneItems = Object.entries(scenesData.items || {})
    .filter(([, item]) => item.type === "scene")
    .map(([sceneId, scene]) => ({
      id: sceneId,
      name: scene.name || `Scene ${sceneId}`,
      x: scene.position?.x || 200,
      y: scene.position?.y || 200,
      isInit: sceneId === initialSceneId,
      transitions: getTransitionsForScene(scene.sections, layouts),
    }));

  // Initialize whiteboard with scene items only
  store.setWhiteboardItems({ items: sceneItems });

  // Restore viewport state from userConfig
  const savedZoomLevel = appService.getUserConfig("scenesMap.zoomLevel");
  const savedPanX = appService.getUserConfig("scenesMap.panX");
  const savedPanY = appService.getUserConfig("scenesMap.panY");

  const { whiteboard } = refs;

  whiteboard.transformedHandlers.handleInitialZoomAndPanSetup({
    panX: savedPanX || 0,
    panY: savedPanY || 0,
    zoomLevel: savedZoomLevel || 1,
  });

  render();
};

export const handleSetInitialScene = async (sceneId, deps) => {
  const { projectService } = deps;

  // Set the initialSceneId in the story object
  await projectService.appendEvent({
    type: "set",
    payload: {
      target: "story.initialSceneId",
      value: sceneId,
    },
  });
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { scenes, story, layouts } = projectService.getState();
  const sceneData = scenes || { tree: [], items: {} };

  // Get current whiteboard items to preserve positions during updates
  const currentWhiteboardItems = store.selectWhiteboardItems() || [];

  // Transform only scene items (not folders) into whiteboard items, preserving current positions
  const initialSceneId = story?.initialSceneId;
  const sceneItems = Object.entries(sceneData.items || {})
    .filter(([, item]) => item.type === "scene")
    .map(([sceneId, scene]) => {
      // Check if this scene already exists in whiteboard with a different position
      const existingWhiteboardItem = currentWhiteboardItems.find(
        (wb) => wb.id === sceneId,
      );

      return {
        id: sceneId,
        name: scene.name || `Scene ${sceneId}`,
        // Use repository position if available, otherwise use existing whiteboard position, finally default to 200,200
        x: scene.position?.x ?? existingWhiteboardItem?.x ?? 200,
        y: scene.position?.y ?? existingWhiteboardItem?.y ?? 200,
        isInit: sceneId === initialSceneId,
        transitions: getTransitionsForScene(scene.sections, layouts),
      };
    });

  // Update both scenes data and whiteboard items
  store.setItems({ scenesData: sceneData });
  store.setLayouts({ layoutsData: layouts });
  store.setWhiteboardItems({ items: sceneItems });
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

  // Update position in repository using 'set' action
  projectService.appendEvent({
    type: "set",
    payload: {
      target: `scenes.items.${itemId}.position`,
      value: { x, y },
    },
  });

  // Update local whiteboard state (already updated by position-updating, but keeping for consistency)
  store.updateItemPosition({ itemId, x, y });
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
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "scenes",
      value: {
        [payload._event.detail.name]: payload._event.detail.value,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
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

    // Create tree array with all line IDs in order
    const lineTree = [
      { id: stepId },
      ...additionalLineIds.map((id) => ({ id })),
    ];

    // Add new scene to repository
    const repositoryAction = {
      type: "treePush",
      target: "scenes",
      value: {
        parent: formData.folderId || "_root",
        position: "last",
        item: {
          id: newSceneId,
          type: "scene",
          name: formData.name || `Scene ${new Date().toLocaleTimeString()}`,
          createdAt: new Date().toISOString(),
          position: {
            x: sceneWhiteboardPosition.x,
            y: sceneWhiteboardPosition.y,
          },
          sections: {
            items: {
              [sectionId]: {
                name: "Section New",
                lines: {
                  items: lineItems,
                  tree: lineTree,
                },
              },
            },
            tree: [
              {
                id: sectionId,
              },
            ],
          },
        },
      },
    };

    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "scenes",
        value: repositoryAction.value.item,
        options: {
          parent: repositoryAction.value.parent,
          position: repositoryAction.value.position,
        },
      },
    });

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

  // Remove from repository
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: "scenes",
      options: {
        id: itemId,
      },
    },
  });

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
    // Set the initialSceneId in the story object
    await projectService.appendEvent({
      type: "set",
      payload: {
        target: "story.initialSceneId",
        value: itemId,
      },
    });

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
    // Remove from repository
    projectService.appendEvent({
      type: "treeDelete",
      payload: {
        target: "scenes",
        options: {
          id: itemId,
        },
      },
    });

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
  store.showPreviewSceneId({
    sceneId: payload._event.target.dataset.sceneId,
  });
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
