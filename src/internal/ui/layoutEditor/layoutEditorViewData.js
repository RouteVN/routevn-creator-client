import { toFlatItems } from "../../project/tree.js";
import {
  getLayoutEditorCreateDefinition,
  getLayoutEditorElementDefinition,
} from "../../layoutEditorElementRegistry.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../projectResolution.js";

export const toLayoutEditorContextMenuItems = (
  items = [],
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
) => {
  return items.map((item) => {
    if (!item?.createType) {
      return item;
    }

    const { createType, ...nextItem } = item;
    const createDefinition = getLayoutEditorCreateDefinition(createType, {
      projectResolution,
    });

    return {
      ...nextItem,
      value: {
        action: "new-child-item",
        ...createDefinition.template,
      },
    };
  });
};

export const toLayoutEditorExplorerItems = (items = []) => {
  return (items ?? []).map((item) => ({
    ...item,
    dragOptions: {
      ...item.dragOptions,
      canReceiveChildren: getLayoutEditorElementDefinition(item.type)
        .isContainer,
    },
  }));
};

export const selectLayoutEditorSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData));
  const item = flatItems.find((entry) => entry.id === state.selectedItemId);
  if (!item) {
    return undefined;
  }

  return {
    ...item,
    anchor: {
      x: item.anchorX,
      y: item.anchorY,
    },
  };
};

export const isItemInsideSaveLoadSlot = ({
  layoutData,
  parentIdById,
  itemId,
}) => {
  if (!itemId) {
    return false;
  }

  let currentParentId = parentIdById[itemId];

  while (currentParentId) {
    if (
      layoutData?.items?.[currentParentId]?.type ===
      "container-ref-save-load-slot"
    ) {
      return true;
    }

    currentParentId = parentIdById[currentParentId];
  }

  return false;
};
