import { toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import {
  formatAnimationDurationLabel,
  toAnimationDisplayItem,
} from "../../internal/animationDisplay.js";

const createTypeMenuItems = [
  {
    label: "Update",
    type: "item",
    value: "update",
  },
  {
    label: "Transition",
    type: "item",
    value: "transition",
  },
];

const buildCatalogItem = (item) => {
  return toAnimationDisplayItem(item);
};

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "animation",
  resourceType: "animations",
  title: "Animations",
  selectedResourceId: "animations",
  resourceCategory: "assets",
  addText: "Add",
  buildCatalogItem,
  matchesSearch,
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedAnimationItem = selectedItem
      ? toAnimationDisplayItem(selectedItem)
      : undefined;

    return {
      ...baseViewData,
      selectedAnimationTypeLabel:
        selectedAnimationItem?.animationTypeLabel ?? "",
      selectedItemDescription: selectedAnimationItem?.description ?? "",
      selectedItemDuration: formatAnimationDurationLabel(
        selectedAnimationItem?.duration,
      ),
      createTypeMenu: state.createTypeMenu,
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  createTypeMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetGroupId: undefined,
    items: createTypeMenuItems,
  },
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectAnimationItemById = selectItemById;

export const selectAnimationDisplayItemById = ({ state }, { itemId } = {}) => {
  const rawItem = toFlatItems(state.data).find(
    (item) => item.id === itemId && item.type === "animation",
  );
  return rawItem ? toAnimationDisplayItem(rawItem) : undefined;
};

export const openCreateTypeMenu = ({ state }, { x, y, targetGroupId } = {}) => {
  state.createTypeMenu.isOpen = true;
  state.createTypeMenu.x = x ?? 0;
  state.createTypeMenu.y = y ?? 0;
  state.createTypeMenu.targetGroupId =
    targetGroupId === "_root" ? undefined : targetGroupId;
};

export const closeCreateTypeMenu = ({ state }) => {
  state.createTypeMenu.isOpen = false;
  state.createTypeMenu.x = 0;
  state.createTypeMenu.y = 0;
  state.createTypeMenu.targetGroupId = undefined;
};

export const selectCreateTypeMenuTargetGroupId = ({ state }) => {
  return state.createTypeMenu.targetGroupId;
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
