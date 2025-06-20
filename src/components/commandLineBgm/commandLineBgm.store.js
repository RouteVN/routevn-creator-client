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
  const flatItems = toFlatItems(state.items).filter(item => item.type === 'folder');
  const flatGroups = toFlatGroups(state.items);

  const loopOptions = [
    { label: 'No Loop', value: 'none' },
    { label: 'Loop Once', value: 'once' },
    { label: 'Loop Forever', value: 'forever' },
    { label: 'Fade In/Out', value: 'fade' }
  ];

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    loopOptions,
  };
};