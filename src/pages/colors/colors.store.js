import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";

const hexToRgb = (hex) => {
  if (!hex) {
    return "";
  }

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return "";
  }

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgb(${r}, ${g}, ${b})`;
};

const editForm = {
  title: "Edit Color",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "hex",
      type: "color-picker",
      label: "Hex Value",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Color",
      },
    ],
  },
};

const addForm = {
  title: "Add Color",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Color Name",
      required: true,
    },
    {
      name: "hex",
      type: "color-picker",
      label: "Hex Value",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Color",
      },
    ],
  },
};

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "color-preview",
      label: "",
    },
    {
      type: "text",
      label: "Hex Value",
      value: item.hex ?? "",
    },
    {
      type: "text",
      label: "RGB Value",
      value: hexToRgb(item.hex ?? ""),
    },
  ];
};

const buildCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "color",
  swatchHex: item.hex ?? "#ffffff",
});

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const hex = (item.hex ?? "").toLowerCase();
  return name.includes(searchQuery) || hex.includes(searchQuery);
};

const selectColorDataItem = (state, itemId) => {
  const item = state.data?.items?.[itemId];
  return item?.type === "color" ? item : undefined;
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
  itemType: "color",
  resourceType: "colors",
  title: "Colors",
  selectedResourceId: "colors",
  resourceCategory: "userInterface",
  addText: "Add Color",
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const editItem = selectColorDataItem(state, state.editItemId);

    return {
      ...baseViewData,
      selectedColorHex: selectedItem?.hex ?? "",
      isEditDialogOpen: state.isEditDialogOpen,
      editDefaultValues: {
        name: editItem?.name ?? "",
        hex: editItem?.hex ?? "",
      },
      editForm,
      isAddDialogOpen: state.isAddDialogOpen,
      addDefaultValues: state.addDefaultValues,
      addForm,
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isEditDialogOpen: false,
  editItemId: undefined,
  isAddDialogOpen: false,
  targetGroupId: undefined,
  addDefaultValues: {
    name: "",
    hex: "#ffffff",
  },
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectColorItemById = selectItemById;

export const openEditDialog = ({ state }, { itemId } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
};

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
  state.addDefaultValues = {
    name: "",
    hex: "#ffffff",
  };
};

export const selectViewData = (context) => {
  return selectCatalogViewData(context);
};
