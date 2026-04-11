import { toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import {
  formatAnimationDurationLabel,
  toAnimationDisplayItem,
} from "../../internal/animationDisplay.js";

const editForm = {
  title: "Edit Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Animation",
      },
    ],
  },
};

const addForm = {
  title: "Add Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
    {
      name: "dialogType",
      type: "segmented-control",
      label: "Type",
      noClear: true,
      required: true,
      options: [
        {
          label: "Update",
          value: "update",
        },
        {
          label: "Transition",
          value: "transition",
        },
      ],
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Continue",
      },
    ],
  },
};

const animationExplorerItemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const animationCenterItemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
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
  resourceCategory: "animatedAssets",
  addText: "Add",
  centerItemContextMenuItems: animationCenterItemContextMenuItems,
  buildCatalogItem,
  matchesSearch,
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedAnimationItem = selectedItem
      ? toAnimationDisplayItem(selectedItem)
      : undefined;

    return {
      ...baseViewData,
      isAddDialogOpen: state.isAddDialogOpen,
      addForm,
      addFormDefaults: {
        name: "",
        description: "",
        dialogType: "update",
      },
      isEditDialogOpen: state.isEditDialogOpen,
      editForm,
      editDefaultValues: state.editDefaultValues,
      itemContextMenuItems: animationExplorerItemContextMenuItems,
      selectedAnimationTypeLabel:
        selectedAnimationItem?.animationTypeLabel ?? "",
      selectedItemDescription: selectedAnimationItem?.description ?? "",
      selectedItemDuration: formatAnimationDurationLabel(
        selectedAnimationItem?.duration,
      ),
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  targetGroupId: undefined,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
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

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const selectTargetGroupId = ({ state }) => {
  return state.targetGroupId;
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeEditDialog = ({ state }) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
