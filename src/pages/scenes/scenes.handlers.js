import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
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
    const { getRefIds } = deps;
    const whiteboardRef = getRefIds().whiteboard;
    if (whiteboardRef && whiteboardRef.elm && whiteboardRef.elm.store) {
      const initialZoomLevel = whiteboardRef.elm.store.selectZoomLevel();
      store.setWhiteboardZoomLevel(initialZoomLevel);
    }
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

export const handleWhiteboardZoomChanged = (e, deps) => {
  const { store, render } = deps;
  const { zoomLevel } = e.detail;
  
  store.setWhiteboardZoomLevel(zoomLevel);
  render();
};

export const handleAddSceneClick = (e, deps) => {
  const { store, render, repository } = deps;

  // Use a simple ID generator instead of nanoid
  const newSceneId = `scene-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const newSceneName = `Scene ${new Date().toLocaleTimeString()}`;

  // Get currently selected folder or default to root
  let targetParent = "_root";
  const currentState = store.getState();
  if (currentState.selectedItemId) {
    // If something is selected, try to use it as parent or its parent
    targetParent = currentState.selectedItemId;
  }

        const sectionId = nanoid();
      const stepId = nanoid();
      // Add new scene to repository
      const repositoryAction = {
        actionType: "treePush",
        target: "scenes",
        value: {
          parent: targetParent,
          position: "last",
          item: {
            id: newSceneId,
            type: "scene",
            name: newSceneName,
            createdAt: new Date().toISOString(),
            position: { x: 200, y: 200 },
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
    name: newSceneName,
    x: 200,
    y: 200,
  });

  // Update store with new scenes data
  const { scenes: updatedScenes } = repository.getState();
  store.setItems(updatedScenes);

  console.log(
    `Scene "${newSceneName}" created successfully in parent ${targetParent}`,
  );
  render();
};

export const handleZoomInClick = (e, deps) => {
  const { getRefIds, store, render } = deps;
  const whiteboardRef = getRefIds().whiteboard;
  
  if (whiteboardRef && whiteboardRef.elm && whiteboardRef.elm.store) {
    let container = whiteboardRef.elm.querySelector('#container');
    if (!container && whiteboardRef.elm.shadowRoot) {
      container = whiteboardRef.elm.shadowRoot.querySelector('#container');
    }

    const rect = container.getBoundingClientRect();
    
    whiteboardRef.elm.store.zoomFromCenter({
      direction: 1,
      containerWidth: rect.width,
      containerHeight: rect.height
    });
  
    whiteboardRef.elm.render();
  
    const newZoomLevel = whiteboardRef.elm.store.selectZoomLevel();
    store.setWhiteboardZoomLevel(newZoomLevel);
    render();
  }
};

export const handleZoomOutClick = (e, deps) => {
  const { getRefIds, store, render } = deps;
  const whiteboardRef = getRefIds().whiteboard;
  
  if (whiteboardRef && whiteboardRef.elm && whiteboardRef.elm.store) {
    let container = whiteboardRef.elm.querySelector('#container');
    if (!container && whiteboardRef.elm.shadowRoot) {
      container = whiteboardRef.elm.shadowRoot.querySelector('#container');
    }

    const rect = container.getBoundingClientRect();
    
    whiteboardRef.elm.store.zoomFromCenter({
      direction: -1,
      containerWidth: rect.width,
      containerHeight: rect.height
    });

    whiteboardRef.elm.render();
    
    const newZoomLevel = whiteboardRef.elm.store.selectZoomLevel();
    store.setWhiteboardZoomLevel(newZoomLevel);
    render();

  }
};

