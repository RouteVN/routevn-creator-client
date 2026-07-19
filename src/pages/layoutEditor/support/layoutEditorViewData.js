import { toFlatItems } from "../../../internal/project/tree.js";
import {
  getLayoutEditorCreateDefinition,
  getLayoutEditorElementDefinition,
} from "../../../internal/layoutEditorElementRegistry.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../../internal/projectResolution.js";
import { formatI18nCopy } from "../../../internal/ui/i18nCopy.js";

const CHOICE_CONTENT_PARENT_TYPES = new Set([
  "container-ref-choice-item",
  "container-ref-choice-single-item",
]);

export const toLayoutEditorContextMenuItems = (
  items = [],
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
) => {
  return compactContextMenuItems(
    items.map((item) => {
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
    }),
  );
};

const isCreateChildMenuItem = (item = {}) => {
  if (item?.createType) {
    return true;
  }

  const value = item?.value;
  return (
    value && typeof value === "object" && value.action === "new-child-item"
  );
};

const hasItemsBeforeNextLabel = (items = [], startIndex = 0) => {
  for (let index = startIndex; index < items.length; index += 1) {
    const item = items[index];
    if (item?.type === "label") {
      return false;
    }

    if (item?.type === "item") {
      return true;
    }
  }

  return false;
};

const compactContextMenuItems = (items = []) => {
  const nextItems = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    if (item.type === "label" && !hasItemsBeforeNextLabel(items, index + 1)) {
      continue;
    }

    if (item.type === "separator") {
      if (nextItems.length === 0) {
        continue;
      }

      if (nextItems[nextItems.length - 1]?.type === "separator") {
        continue;
      }
    }

    nextItems.push(item);
  }

  while (nextItems[nextItems.length - 1]?.type === "separator") {
    nextItems.pop();
  }

  return nextItems;
};

const toLeafItemContextMenuItems = (items = []) => {
  return compactContextMenuItems(
    (items ?? []).filter((item) => !isCreateChildMenuItem(item)),
  );
};

const isChoiceContentCreateMenuItem = (item = {}) => {
  return (
    item?.value?.action === "new-child-item" &&
    item.value.type === "text-ref-choice-item-content"
  );
};

const toContainerContextMenuItems = (items = [], parentItem = {}) => {
  return compactContextMenuItems(
    (items ?? []).filter((item) => {
      if (!isChoiceContentCreateMenuItem(item)) {
        return true;
      }

      return CHOICE_CONTENT_PARENT_TYPES.has(parentItem.type);
    }),
  );
};

export const toLayoutEditorExplorerItems = (
  items = [],
  { contextMenuItems, copy = {}, alwaysShowVisibilityToggle = false } = {},
) => {
  const leafItemContextMenuItems = toLeafItemContextMenuItems(contextMenuItems);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const effectivelyHiddenById = new Map();

  const resolveEffectivelyHidden = (item) => {
    if (effectivelyHiddenById.has(item.id)) {
      return effectivelyHiddenById.get(item.id);
    }

    const parentItem = item.parentId ? itemById.get(item.parentId) : undefined;
    const effectivelyHidden =
      item.hidden === true ||
      (parentItem ? resolveEffectivelyHidden(parentItem) : false);
    effectivelyHiddenById.set(item.id, effectivelyHidden);
    return effectivelyHidden;
  };

  return (items ?? []).map((item) => {
    const definition = getLayoutEditorElementDefinition(item.type);
    const canReceiveChildren =
      item.type === "folder" || definition.isContainer === true;
    const hasPreviewDependencies =
      Object.keys(definition.previewDependencies).length > 0;
    const svg =
      item.type === "spritesheet-animation" ? "spritesheets" : item.svg;
    const hidden = item.hidden === true;
    const effectivelyHidden = resolveEffectivelyHidden(item);
    const visibilityLabel = formatI18nCopy(
      hidden
        ? (copy.showElementLabel ?? "Show {elementName}")
        : (copy.hideElementLabel ?? "Hide {elementName}"),
      {
        elementName: item.name,
      },
    );

    return {
      ...item,
      svg,
      contextMenuItems:
        canReceiveChildren === true
          ? toContainerContextMenuItems(contextMenuItems, item)
          : leafItemContextMenuItems,
      iconCornerBadge: hasPreviewDependencies,
      visibilityToggle: true,
      visibilityToggleAlwaysVisible:
        alwaysShowVisibilityToggle === true || hidden,
      visibilityIcon: hidden ? "eyeClosed" : "eye",
      visibilityLabel,
      hidden,
      effectivelyHidden,
      iconColor: effectivelyHidden ? "mu-fg" : "fg",
      iconCssColor: effectivelyHidden
        ? "var(--muted-foreground)"
        : "var(--foreground)",
      textColor: effectivelyHidden ? "mu-fg" : "fg",
      dragOptions: {
        ...item.dragOptions,
        canReceiveChildren,
      },
    };
  });
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

export const isItemDirectChildOfDirectedContainer = ({
  layoutData,
  parentIdById,
  itemId,
}) => {
  if (!itemId) {
    return false;
  }

  const parentId = parentIdById[itemId];
  if (!parentId) {
    return false;
  }

  const parent = layoutData?.items?.[parentId];
  return (
    parent?.type === "container" &&
    (parent.direction === "horizontal" || parent.direction === "vertical")
  );
};
