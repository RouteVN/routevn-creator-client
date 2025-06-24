
import { toFlatGroups, toFlatItems } from "../../repository";

export const INITIAL_STATE = Object.freeze({
  mode: 'current',
  items: [],
  selectedImageId: undefined,
  selectedFileId: undefined,
  tempSelectedImageId: undefined,
});

export const selectSelectedImageId = ({ state }) => {
  return state.selectedImageId;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};


export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const setSelectedImageAndFileId = (state, payload) => {
  state.selectedImageId = payload.imageId;
  state.selectedFileId = payload.fileId;
};

export const setTempSelectedImageId = (state, payload) => {
  state.tempSelectedImageId = payload.imageId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.items).filter(item => item.type === 'folder');
  const flatGroups = toFlatGroups(state.items)
  .map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedImageId;
        return {
          ...child,
          bw: isSelected ? 'md' : '',
        }
      }),
    }
  });





  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    selectedImageId: state.selectedImageId,
    selectedFileId: state.selectedFileId,
  };
};
