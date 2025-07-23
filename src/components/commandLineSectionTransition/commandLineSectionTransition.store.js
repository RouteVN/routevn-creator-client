import { toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  sections: [],
  selectedSectionId: undefined,
  selectedAnimation: "fade",
  searchQuery: "",
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setSections = (state, payload) => {
  state.sections = payload.sections;
};

export const setSelectedSectionId = (state, payload) => {
  state.selectedSectionId = payload.sectionId;
};

export const setSelectedAnimation = (state, payload) => {
  state.selectedAnimation = payload.animation;
};

export const setSearchQuery = (state, payload) => {
  state.searchQuery = payload.query;
};

export const toViewData = ({ state, props }, payload) => {
  // Get all sections from the current scene
  const allSections = state.sections || [];

  // Filter sections by search query
  const filteredSections = state.searchQuery
    ? allSections.filter((section) =>
        section.name.toLowerCase().includes(state.searchQuery.toLowerCase()),
      )
    : allSections;

  // Create a single group containing all sections (no folder structure for sections)
  const enhancedGroups = [];

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

  const animationOptions = [
    { value: "fade", label: "Fade" },
    { value: "slide", label: "Slide" },
    { value: "dissolve", label: "Dissolve" },
    { value: "wipe", label: "Wipe" },
    { value: "none", label: "None" },
  ];

  // Get selected section data
  const selectedSection = state.selectedSectionId
    ? allSections.find((section) => section.id === state.selectedSectionId)
    : null;

  return {
    mode: state.mode,
    sections: allSections,
    groups: enhancedGroups,
    animationOptions,
    selectedSectionId: state.selectedSectionId,
    selectedAnimation: state.selectedAnimation,
    selectedSection,
    searchQuery: state.searchQuery,
  };
};
