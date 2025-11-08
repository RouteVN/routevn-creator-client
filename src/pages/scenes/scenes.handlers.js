import { nanoid } from "nanoid";
import { createUserConfig } from "../../deps/userConfig";

/**
 *
 * @param {Object} sections
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
const getTransitionsForScene = (sections) => {
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
        if (sectionTransition && sectionTransition.sceneId) {
          transitions.push(sectionTransition.sceneId);
        }
      }
    }
  }

  return transitions;
};

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render, getRefIds } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { scenes, story } = repository.getState();
  const scenesData = scenes || { tree: [], items: {} };

  // Set the scenes data
  store.setItems(scenesData);

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
      transitions: getTransitionsForScene(scene.sections),
    }));

  // Initialize whiteboard with scene items only
  store.setWhiteboardItems(sceneItems);

  // Restore viewport state from userConfig
  const userConfig = createUserConfig();
  const savedZoomLevel = userConfig.get("scenesMap.zoomLevel");
  const savedPanX = userConfig.get("scenesMap.panX");
  const savedPanY = userConfig.get("scenesMap.panY");

  const { whiteboard } = getRefIds();

  whiteboard.elm.transformedHandlers.handleInitialZoomAndPanSetup({
    panX: savedPanX || 0,
    panY: savedPanY || 0,
    zoomLevel: savedZoomLevel || 1,
  });

  render();
};

export const handleSetInitialScene = async (sceneId, deps) => {
  const { repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  // Set the initialSceneId in the story object
  await repository.addEvent({
    type: "set",
    target: "story.initialSceneId",
    value: sceneId,
  });
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { scenes, story } = repository.getState();
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
        transitions: getTransitionsForScene(scene.sections),
      };
    });

  // Update both scenes data and whiteboard items
  store.setItems(sceneData);
  store.setWhiteboardItems(sceneItems);
  render();
};

export const handleFileExplorerClickItem = (deps) => {
  const { subject, router } = deps;
  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: "/project/scene-editor",
    payload: currentPayload, // Preserve existing payload (including p for projectId)
  });
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
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, x, y } = payload._event.detail;

  // Update position in repository using 'set' action
  repository.addEvent({
    type: "set",
    target: `scenes.items.${itemId}.position`,
    value: { x, y },
  });

  // Update local whiteboard state (already updated by position-updating, but keeping for consistency)
  store.updateItemPosition({ itemId, x, y });
  render();
};

export const handleWhiteboardItemSelected = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;

  // Update selected item for detail panel
  store.setSelectedItemId(itemId);
  render();
};

export const handleWhiteboardItemDoubleClick = (deps, payload) => {
  const { subject, router } = deps;
  const { itemId } = payload._event.detail;

  if (!itemId) {
    console.error("ERROR: itemId is missing in double-click event");
    return;
  }

  // Redirect to scene editor with sceneId in payload
  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: "/project/scene-editor",
    payload: { ...currentPayload, sceneId: itemId }, // Preserve p and add sceneId
  });
};

export const handleAddSceneClick = (deps) => {
  const { store, render } = deps;

  // Start waiting for transform
  store.setWaitingForTransform(true);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: "scenes",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { scenes } = repository.getState();
  store.setItems(scenes);
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
    store.setWaitingForTransform(false);
    store.setShowSceneForm(true);
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
  store.setShowSceneForm(true);
  render();
};

export const handleSceneFormClose = (deps) => {
  const { store, render } = deps;
  store.resetSceneForm();
  render();
};

export const handleSceneFormAction = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const actionId = payload._event.detail.actionId;

  if (actionId === "cancel") {
    store.resetSceneForm();
    render();
  } else if (actionId === "submit") {
    const sceneWhiteboardPosition = store.selectSceneWhiteboardPosition();

    // Get form values from the event detail (same pattern as typography)
    const formData = payload._event.detail.formValues;

    console.log("Submitting scene with form data:", formData);

    // Use a simple ID generator instead of nanoid
    const newSceneId = `scene-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const sectionId = nanoid();
    const stepId = nanoid();

    // Generate 31 additional line IDs
    const additionalLineIds = Array.from({ length: 31 }, () => nanoid());

    // Get layouts from repository to find first dialogue layout
    const { layouts } = repository.getState();
    let dialogueLayoutId = null;

    if (layouts && layouts.items) {
      // Find first layout with layoutType: "dialogue"
      for (const [layoutId, layout] of Object.entries(layouts.items)) {
        if (layout.layoutType === "dialogue") {
          dialogueLayoutId = layoutId;
          break;
        }
      }
    }

    // Create actions object with dialogue layout if found
    const actions = dialogueLayoutId
      ? {
          dialogue: {
            layoutId: dialogueLayoutId,
            mode: "adv",
            content: [{ text: "" }],
          },
        }
      : {
          dialogue: {
            mode: "adv",
            content: [{ text: "" }],
          },
        };

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

    await repository.addEvent({
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
    const { scenes: updatedScenes } = repository.getState();
    store.setItems(updatedScenes);

    // Reset form
    store.resetSceneForm();

    console.log(
      `Scene "${formData.name}" created successfully in folder "${formData.folderId}" at (${sceneWhiteboardPosition.x}, ${sceneWhiteboardPosition.y})`,
    );
    render();
  }
};

export const handleWhiteboardItemDelete = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId } = payload._event.detail;

  // Remove from repository
  await repository.addEvent({
    type: "treeDelete",
    payload: {
      target: "scenes",
      value: {
        id: itemId,
      },
    },
  });

  // Update store with new scenes data
  const { scenes: updatedScenes } = repository.getState();
  store.setItems(updatedScenes);

  // Remove from whiteboard items
  const currentWhiteboardItems = store.selectWhiteboardItems();
  const updatedWhiteboardItems = currentWhiteboardItems.filter(
    (item) => item.id !== itemId,
  );
  store.setWhiteboardItems(updatedWhiteboardItems);

  // Clear selection if the deleted item was selected
  const selectedItemId = store.selectSelectedItemId();
  if (selectedItemId === itemId) {
    store.setSelectedItemId(null);
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
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
    await repository.addEvent({
      type: "set",
      target: "story.initialSceneId",
      value: itemId,
    });

    // Get updated scenes data
    const { scenes: updatedScenes, story } = repository.getState();
    store.setItems(updatedScenes);

    // Update whiteboard items with new colors
    const currentWhiteboardItems = store.selectWhiteboardItems();
    const initialSceneId = story?.initialSceneId;
    const updatedWhiteboardItems = currentWhiteboardItems.map((item) => ({
      ...item,
      isInit: item.id === initialSceneId,
    }));
    store.setWhiteboardItems(updatedWhiteboardItems);

    render();
  }

  // Handle delete action
  if (item.value === "delete-item" && itemId) {
    // Remove from repository
    repository.addEvent({
      type: "treeDelete",
      target: "scenes",
      value: {
        id: itemId,
      },
    });

    // Update store with new scenes data
    const { scenes: updatedScenes } = repository.getState();
    store.setItems(updatedScenes);

    // Remove from whiteboard items
    const currentWhiteboardItems = store.selectWhiteboardItems();
    const updatedWhiteboardItems = currentWhiteboardItems.filter(
      (item) => item.id !== itemId,
    );
    store.setWhiteboardItems(updatedWhiteboardItems);

    // Clear selection if the deleted item was selected
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId === itemId) {
      store.setSelectedItemId(null);
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

export const handleWhiteboardZoomChanged = (deps, payload) => {
  const userConfig = createUserConfig();
  const { zoomLevel } = payload._event.detail;
  userConfig.set("scenesMap.zoomLevel", zoomLevel);
};

export const handleWhiteboardPanChanged = (deps, payload) => {
  const userConfig = createUserConfig();
  const { panX, panY } = payload._event.detail;
  userConfig.set("scenesMap.panX", panX);
  userConfig.set("scenesMap.panY", panY);
};
