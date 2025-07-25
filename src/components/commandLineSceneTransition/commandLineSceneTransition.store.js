import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  tab: "section", // "section" or "scene"
  items: [], // scenes
  sections: [], // sections
  selectedSceneId: undefined,
  selectedSectionId: undefined,
  selectedAnimation: "fade",
  searchQuery: "",
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const setSections = (state, payload) => {
  state.sections = payload.sections;
};

export const setTab = (state, payload) => {
  state.tab = payload.tab;
};

export const setSelectedSceneId = (state, payload) => {
  state.selectedSceneId = payload.sceneId;
};

export const setSelectedSectionId = (state, payload) => {
  state.selectedSectionId = payload.sectionId;
};

export const selectTab = ({ state }) => {
  return state.tab;
};

export const setSelectedAnimation = (state, payload) => {
  state.selectedAnimation = payload.animation;
};

export const setSearchQuery = (state, payload) => {
  state.searchQuery = payload.query;
};

export const toViewData = ({ state, props }, payload) => {
  let enhancedGroups = [];
  let selectedItem = null;
  let selectedName = null;

  if (state.tab === "scene") {
    const allItems = toFlatItems(state.items);
    const flatItems = allItems.filter((item) => item.type === "folder");
    const flatGroups = toFlatGroups(state.items);

    // Find all scenes
    const allScenes = allItems.filter((item) => item.type === "scene");

    // Filter scenes by search query
    const filteredScenes = state.searchQuery
      ? allScenes.filter((scene) =>
          scene.name.toLowerCase().includes(state.searchQuery.toLowerCase()),
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

    // Get selected scene data
    selectedItem = state.selectedSceneId
      ? allItems.find((item) => item.id === state.selectedSceneId)
      : null;
    selectedName = selectedItem?.name;
  } else if (state.tab === "section") {
    // Get all sections from the current scene
    const allSections = state.sections || [];

    // Filter sections by search query
    const filteredSections = state.searchQuery
      ? allSections.filter((section) =>
          section.name.toLowerCase().includes(state.searchQuery.toLowerCase()),
        )
      : allSections;

    // Create a single group containing all sections
    if (filteredSections.length > 0) {
      enhancedGroups.push({
        type: "virtual-group",
        name: "Sections",
        id: "sections",
        fullLabel: "Sections",
        _level: 0,
        children: filteredSections,
      });
    }

    // Get selected section data
    selectedItem = state.selectedSectionId
      ? allSections.find((section) => section.id === state.selectedSectionId)
      : null;
    selectedName = selectedItem?.name;
  }

  const animationOptions = [
    { value: "fade", label: "Fade" },
    { value: "slide", label: "Slide" },
    { value: "dissolve", label: "Dissolve" },
    { value: "wipe", label: "Wipe" },
    { value: "none", label: "None" },
  ];

  const tabs = [
    {
      id: "section",
      label: "Sections",
    },
    {
      id: "scene",
      label: "Scenes",
    },
  ];

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
  ];

  if (state.mode === "gallery") {
    breadcrumb.push({
      id: "current",
      label: "Transition",
    });
    breadcrumb.push({
      label: state.tab === "section" ? "Section Selection" : "Scene Selection",
    });
  } else {
    breadcrumb.push({
      label: "Transition",
    });
  }

  return {
    mode: state.mode,
    tab: state.tab,
    tabs,
    groups: enhancedGroups,
    animationOptions,
    selectedSceneId: state.selectedSceneId,
    selectedSectionId: state.selectedSectionId,
    selectedAnimation: state.selectedAnimation,
    selectedItem,
    selectedName,
    searchQuery: state.searchQuery,
    breadcrumb,
  };
};
