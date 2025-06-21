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

  const positionOptions = [
    { label: 'Top Left', value: 'top-left' },
    { label: 'Top Center', value: 'top-center' },
    { label: 'Top Right', value: 'top-right' },
    { label: 'Center Left', value: 'center-left' },
    { label: 'Center', value: 'center' },
    { label: 'Center Right', value: 'center-right' },
    { label: 'Bottom Left', value: 'bottom-left' },
    { label: 'Bottom Center', value: 'bottom-center' },
    { label: 'Bottom Right', value: 'bottom-right' }
  ];

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    positionOptions,
  };
};