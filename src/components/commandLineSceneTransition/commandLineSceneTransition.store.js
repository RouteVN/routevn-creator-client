import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  selectedSceneId: undefined,
  selectedAnimation: "fade",
  searchQuery: "",
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const setSelectedSceneId = (state, payload) => {
  state.selectedSceneId = payload.sceneId;
};

export const setSelectedAnimation = (state, payload) => {
  state.selectedAnimation = payload.animation;
};

export const setSearchQuery = (state, payload) => {
  state.searchQuery = payload.query;
};

export const toViewData = ({ state, props }, payload) => {
  const allItems = toFlatItems(state.items);
  const flatItems = allItems.filter((item) => item.type === "folder");
  const flatGroups = toFlatGroups(state.items);

  // Find all scenes
  const allScenes = allItems.filter((item) => item.type === "scene");
  
  // Filter scenes by search query
  const filteredScenes = state.searchQuery
    ? allScenes.filter((scene) =>
        scene.name.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : allScenes;

  // Group filtered scenes by their parent folder
  const scenesByFolder = {};
  
  filteredScenes.forEach((scene) => {
    const folderId = scene.parentId || "root";
    if (!scenesByFolder[folderId]) {
      scenesByFolder[folderId] = [];
    }
    scenesByFolder[folderId].push(scene);
  });

  // Create groups with filtered scenes
  const enhancedGroups = [];
  
  // Add root scenes if any
  if (scenesByFolder.root && scenesByFolder.root.length > 0) {
    enhancedGroups.push({
      type: "virtual-group",
      name: "Root Scenes",
      id: "root-scenes",
      fullLabel: "Root Scenes",
      _level: 0,
      children: scenesByFolder.root,
    });
  }
  
  // Add folder groups with scenes
  flatGroups.forEach((group) => {
    if (scenesByFolder[group.id] && scenesByFolder[group.id].length > 0) {
      enhancedGroups.push({
        ...group,
        children: scenesByFolder[group.id],
      });
    }
  });

  const animationOptions = [
    { value: "fade", label: "Fade" },
    { value: "slide", label: "Slide" },
    { value: "dissolve", label: "Dissolve" },
    { value: "wipe", label: "Wipe" },
    { value: "none", label: "None" },
  ];

  // Get selected scene data
  const selectedScene = state.selectedSceneId
    ? allItems.find((item) => item.id === state.selectedSceneId)
    : null;

  console.log("commandLineSceneTransition toViewData:", {
    selectedSceneId: state.selectedSceneId,
    selectedAnimation: state.selectedAnimation,
    selectedScene: selectedScene?.name,
    mode: state.mode
  });

  return {
    mode: state.mode,
    items: flatItems,
    groups: enhancedGroups,
    animationOptions,
    selectedSceneId: state.selectedSceneId,
    selectedAnimation: state.selectedAnimation,
    selectedScene,
    searchQuery: state.searchQuery,
  };
};
