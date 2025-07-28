import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { scenes } = repository.getState();
  const scenesData = scenes || { tree: [], items: {} };

  // Set the scenes data
  store.setItems(scenesData);

  // Transform only scene items (not folders) into whiteboard items
  const sceneItems = Object.entries(scenesData.items || {})
    .filter(([key, item]) => item.type === "scene")
    .map(([sceneId, scene]) => ({
      id: sceneId,
      name: scene.name || `Scene ${sceneId}`,
      x: scene.position?.x || 200,
      y: scene.position?.y || 200,
    }));

  // Initialize whiteboard with scene items only
  store.setWhiteboardItems(sceneItems);

  return () => {
    render();
  };
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { scenes } = repository.getState();
  const sceneData = scenes || { tree: [], items: {} };

  // Get current whiteboard items to preserve positions during updates
  const currentState = store.getState();
  const currentWhiteboardItems = currentState.whiteboardItems || [];

  // Transform only scene items (not folders) into whiteboard items, preserving current positions
  const sceneItems = Object.entries(sceneData.items || {})
    .filter(([key, item]) => item.type === "scene")
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
      };
    });

  // Update both scenes data and whiteboard items
  store.setItems(sceneData);
  store.setWhiteboardItems(sceneItems);
  render();
};

export const handleFileExplorerClickItem = (e, deps) => {
  const { subject } = deps;
  subject.dispatch("redirect", {
    path: "/project/scene-editor",
  });
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const handleWhiteboardItemPositionChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { itemId, x, y } = e.detail;

  // Update position in repository using 'set' action
  repository.addAction({
    actionType: "set",
    target: `scenes.items.${itemId}.position`,
    value: { x, y },
  });

  // Update local whiteboard state
  store.updateItemPosition({ itemId, x, y });
  render();
};

export const handleWhiteboardItemSelected = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail;

  // Update selected item for detail panel
  store.setSelectedItemId(itemId);
  render();
};

export const handleWhiteboardItemDoubleClick = (e, deps) => {
  const { subject } = deps;
  const { itemId } = e.detail;

  if (!itemId) {
    console.error("ERROR: itemId is missing in double-click event");
    return;
  }

  // Redirect to scene editor with sceneId in payload
  subject.dispatch("redirect", {
    path: "/project/scene-editor",
    payload: { sceneId: itemId },
  });
};

export const handleAddSceneClick = (e, deps) => {
  const { store, render } = deps;

  // Start waiting for placement
  store.setWaitingForPlacement(true);
  render();
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "scenes",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { scenes } = repository.getState();
  store.setItems(scenes);
  render();
};

export const handleWhiteboardClick = (e, deps) => {
  const { store, render } = deps;
  const currentState = store.getState();

  if (currentState.isWaitingForPlacement) {
    // Get click position relative to whiteboard
    const { formX, formY, whiteboardX, whiteboardY } = e.detail;

    // Reset form data
    store.setSceneFormData({ name: "", folderId: "_root" });

    // Show the form at the clicked position
    store.setSceneFormPosition({ x: formX, y: formY });
    store.setSceneWhiteboardPosition({ x: whiteboardX, y: whiteboardY });
    store.setWaitingForPlacement(false);
    store.setShowSceneForm(true);
    render();
  }
};

export const handleSceneFormClose = (e, deps) => {
  const { store, render } = deps;
  store.resetSceneForm();
  render();
};

export const handleSceneFormAction = (e, deps) => {
  const { store, render, repository } = deps;
  const actionId = e.detail.actionId;

  if (actionId === "cancel") {
    store.resetSceneForm();
    render();
  } else if (actionId === "submit") {
    const currentState = store.getState();
    const { sceneWhiteboardPosition } = currentState;

    // Get form values from the event detail (same pattern as typography)
    const formData = e.detail.formValues;

    console.log("Submitting scene with form data:", formData);

    // Use a simple ID generator instead of nanoid
    const newSceneId = `scene-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const sectionId = nanoid();
    const stepId = nanoid();
    // Add new scene to repository
    const repositoryAction = {
      actionType: "treePush",
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
                  items: {
                    [stepId]: {
                      instructions: {
                        presentationInstructions: {},
                      },
                    },
                  },
                  tree: [
                    {
                      id: stepId,
                    },
                  ],
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

    repository.addAction(repositoryAction);

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

export const handleWhiteboardItemDelete = (e, deps) => {
  const { store, render, repository } = deps;
  const { itemId } = e.detail;

  // Remove from repository
  repository.addAction({
    actionType: "treeDelete",
    target: "scenes",
    value: {
      id: itemId,
    },
  });

  // Update store with new scenes data
  const { scenes: updatedScenes } = repository.getState();
  store.setItems(updatedScenes);

  // Remove from whiteboard items
  const currentState = store.getState();
  const updatedWhiteboardItems = currentState.whiteboardItems.filter(
    (item) => item.id !== itemId,
  );
  store.setWhiteboardItems(updatedWhiteboardItems);

  // Clear selection if the deleted item was selected
  if (currentState.selectedItemId === itemId) {
    store.setSelectedItemId(null);
  }

  render();
};

export const handleWhiteboardItemContextMenu = (e, deps) => {
  const { store, render } = deps;
  const { itemId, x, y } = e.detail;

  // Show dropdown menu at the provided position
  store.showDropdownMenu({
    position: { x, y },
    itemId,
  });

  render();
};

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;
  const itemId = store.selectDropdownMenuItemId();

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  // Handle delete action
  if (item.value === "delete-item" && itemId) {
    // Remove from repository
    repository.addAction({
      actionType: "treeDelete",
      target: "scenes",
      value: {
        id: itemId,
      },
    });

    // Update store with new scenes data
    const { scenes: updatedScenes } = repository.getState();
    store.setItems(updatedScenes);

    // Remove from whiteboard items
    const currentState = store.getState();
    const updatedWhiteboardItems = currentState.whiteboardItems.filter(
      (item) => item.id !== itemId,
    );
    store.setWhiteboardItems(updatedWhiteboardItems);

    // Clear selection if the deleted item was selected
    if (currentState.selectedItemId === itemId) {
      store.setSelectedItemId(null);
    }

    render();
  }
};
