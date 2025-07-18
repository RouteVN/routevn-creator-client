import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  selectedLayoutId: undefined,
  tempSelectedLayoutId: undefined,
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const selectSelectedLayoutId = ({ state }) => {
  return state.selectedLayoutId;
};

export const selectTempSelectedLayoutId = ({ state }) => {
  return state.tempSelectedLayoutId;
};

export const setSelectedLayoutId = (state, payload) => {
  state.selectedLayoutId = payload.layoutId;
};

export const setTempSelectedLayoutId = (state, payload) => {
  state.tempSelectedLayoutId = payload.layoutId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const flatGroups = toFlatGroups(state.items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedLayoutId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  const positionOptions = [
    { label: "Top Left", value: "top-left" },
    { label: "Top Center", value: "top-center" },
    { label: "Top Right", value: "top-right" },
    { label: "Center Left", value: "center-left" },
    { label: "Center", value: "center" },
    { label: "Center Right", value: "center-right" },
    { label: "Bottom Left", value: "bottom-left" },
    { label: "Bottom Center", value: "bottom-center" },
    { label: "Bottom Right", value: "bottom-right" },
  ];

  const selectedLayout = state.selectedLayoutId
    ? toFlatItems(state.items).find(
        (layout) => layout.id === state.selectedLayoutId,
      )
    : null;
  const selectedLayoutName = selectedLayout ? selectedLayout.name : null;

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    positionOptions,
    selectedLayoutId: state.selectedLayoutId,
    selectedLayoutName: selectedLayoutName,
    tempSelectedLayoutId: state.tempSelectedLayoutId,
  };
};
