import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { isFragmentLayout } from "../../internal/project/layout.js";

const fragmentField = {
  name: "isFragment",
  type: "checkbox",
  content: "Can Be Used As Fragment",
};

const layoutDescriptionField = {
  name: "description",
  type: "input-textarea",
  label: "Description",
};

const layoutForm = {
  title: "Add Layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Layout Name",
      required: true,
    },
    {
      name: "layoutType",
      type: "select",
      label: "Layout Type",
      required: true,
      options: [
        { value: "normal", label: "Normal" },
        { value: "save-load", label: "Save / Load" },
        { value: "confirmDialog", label: "Confirm Dialog" },
        { value: "history", label: "History" },
        { value: "dialogue", label: "Dialogue" },
        { value: "nvl", label: "NVL" },
        { value: "choice", label: "Choice" },
      ],
      tooltip: {
        content:
          "Normal is layout that can be used for background or menu pages. Save / Load is used for save-slot based save and load screens. Confirm Dialog is used for compact confirmation prompts with OK and Cancel areas. History is used for dialogue history layered views. Dialogue is used for ADV mode text dialogue layout. NVL is used for novel mode accumulated dialogue layout. Choice is used for the choices.",
      },
    },
    layoutDescriptionField,
    fragmentField,
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Layout",
      },
    ],
  },
};

const editLayoutForm = {
  title: "Edit Layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Layout Name",
      required: true,
    },
    layoutDescriptionField,
    fragmentField,
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Save",
      },
    ],
  },
};

const layoutExplorerItemContextMenuItems = [
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const layoutCenterItemContextMenuItems = [
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const layoutTypeLabels = {
  normal: "Normal",
  "save-load": "Save / Load",
  confirmDialog: "Confirm Dialog",
  history: "History",
  dialogue: "Dialogue",
  nvl: "NVL",
  choice: "Choice",
};

const buildDetailFields = (item) => {
  if (!item || item.type !== "layout") {
    return [];
  }

  const layoutType = item.layoutType;
  const fields = [
    {
      type: "slot",
      slot: "actions",
    },
    {
      type: "text",
      label: "Layout Type",
      value: layoutTypeLabels[layoutType] ?? layoutType ?? "",
    },
    {
      type: "text",
      label: "Fragment",
      value: isFragmentLayout(item) ? "Yes" : "No",
    },
  ];

  if (item.description) {
    fields.push({
      type: "description",
      value: item.description,
    });
  }

  return fields;
};

const buildCatalogItem = (item) => {
  const layoutType = item.layoutType;
  const subtitle = isFragmentLayout(item)
    ? `${layoutTypeLabels[layoutType] ?? layoutType ?? ""} / Fragment`
    : (layoutTypeLabels[layoutType] ?? layoutType ?? "");

  return {
    id: item.id,
    name: item.name,
    cardKind: "layout",
    subtitle,
  };
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
  itemType: "layout",
  resourceType: "layouts",
  title: "Layouts",
  selectedResourceId: "layouts",
  resourceCategory: "userInterface",
  addText: "Add Layout",
  centerItemContextMenuItems: layoutCenterItemContextMenuItems,
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, baseViewData }) => ({
    ...baseViewData,
    itemContextMenuItems: layoutExplorerItemContextMenuItems,
    isAddDialogOpen: state.isAddDialogOpen,
    layoutForm,
    layoutFormDefaults: {
      name: "",
      layoutType: "normal",
      description: "",
      isFragment: false,
    },
  }),
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
    isFragment: false,
  },
  targetGroupId: undefined,
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectLayoutItemById = selectItemById;

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const openEditDialog = (
  { state },
  { itemId, defaultValues = {} } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
    isFragment: defaultValues?.isFragment ?? false,
  };
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
    isFragment: false,
  };
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    isEditDialogOpen: context.state.isEditDialogOpen,
    editDefaultValues: context.state.editDefaultValues,
    editForm: editLayoutForm,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
