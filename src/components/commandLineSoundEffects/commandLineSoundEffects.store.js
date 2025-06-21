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

  const triggerOptions = [
    { label: 'On Click', value: 'click' },
    { label: 'On Hover', value: 'hover' },
    { label: 'On Enter', value: 'enter' },
    { label: 'On Exit', value: 'exit' },
    { label: 'Manual', value: 'manual' }
  ];

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    triggerOptions,
  };
};