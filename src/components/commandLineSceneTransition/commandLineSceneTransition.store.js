import { toFlatGroups, toFlatItems } from "../../repository";

export const INITIAL_STATE = Object.freeze({
  mode: 'current',
  items: [],
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const toViewData = ({ state, props }, payload) => {
  const allItems = toFlatItems(state.items);
  const flatItems = allItems.filter(item => item.type === 'folder');
  const flatGroups = toFlatGroups(state.items);
  
  // Find root-level scenes (scenes with no parent folder)
  const rootScenes = allItems.filter(item => item.type === 'scene' && !item.parentId);
  
  // Create a virtual "Root Scenes" group if there are root-level scenes
  const enhancedGroups = [...flatGroups];
  if (rootScenes.length > 0) {
    enhancedGroups.unshift({
      type: 'virtual-group',
      name: 'Root Scenes',
      id: 'root-scenes',
      fullLabel: 'Root Scenes',
      _level: 0,
      children: rootScenes
    });
  }

  const animationOptions = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide', label: 'Slide' },
    { value: 'dissolve', label: 'Dissolve' },
    { value: 'wipe', label: 'Wipe' },
    { value: 'none', label: 'None' }
  ];


  return {
    mode: state.mode,
    items: flatItems,
    groups: enhancedGroups,
    animationOptions,
  };
};