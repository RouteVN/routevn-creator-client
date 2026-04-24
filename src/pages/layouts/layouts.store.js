import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { isFragmentLayout } from "../../internal/project/layout.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";

export const LAYOUT_TAG_SCOPE_KEY = "layouts";

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
        { value: "general", label: "General" },
        { value: "save-load", label: "Save / Load" },
        { value: "confirmDialog", label: "Confirm Dialog" },
        { value: "history", label: "History" },
        { value: "dialogue-adv", label: "Dialogue ADV" },
        { value: "dialogue-nvl", label: "Dialogue NVL" },
        { value: "choice", label: "Choice" },
      ],
      tooltip: {
        content:
          "General is the flexible layout type for backgrounds, menus, and other all-purpose screens. Save / Load is used for save-slot based save and load screens. Confirm Dialog is used for compact confirmation prompts with OK and Cancel areas. History is used for dialogue history overlays. Dialogue ADV is used for ADV mode text dialogue layout. Dialogue NVL is used for novel mode accumulated dialogue layout. Choice is used for the choices.",
      },
    },
    layoutDescriptionField,
    createTagField(),
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
    createTagField(),
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
  general: "General",
  "save-load": "Save / Load",
  confirmDialog: "Confirm Dialog",
  history: "History",
  "dialogue-adv": "Dialogue ADV",
  "dialogue-nvl": "Dialogue NVL",
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
    {
      type: "slot",
      slot: "layout-tags",
      label: "Tags",
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
  const typeInfo = layoutTypeLabels[layoutType] ?? layoutType ?? "";

  return {
    id: item.id,
    name: item.name,
    cardKind: "layout",
    cardVariant: "thumbnail",
    previewFileId: item.thumbnailFileId,
    typeInfo,
    typeInfoSvg: isFragmentLayout(item) ? "fragment" : undefined,
  };
};

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "layout",
  resourceType: "layouts",
  title: "Layouts",
  selectedResourceId: "layouts",
  resourceCategory: "userInterface",
  addText: "Add",
  centerItemContextMenuItems: layoutCenterItemContextMenuItems,
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildCatalogItem,
  hiddenMobileDetailSlots: ["actions"],
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, baseViewData }) => ({
    ...baseViewData,
    itemContextMenuItems: layoutExplorerItemContextMenuItems,
    isAddDialogOpen: state.isAddDialogOpen,
    layoutForm,
    layoutFormDefaults: {
      name: "",
      layoutType: "general",
      description: "",
      tagIds: [],
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
    tagIds: [],
    isFragment: false,
  },
  targetGroupId: undefined,
});

export {
  setItems,
  setSelectedItemId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
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
    tagIds: defaultValues?.tagIds ?? [],
    isFragment: defaultValues?.isFragment ?? false,
  };
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
    isFragment: false,
  };
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);
  const flatItems = applyFolderRequiredRootDragOptions(viewData.flatItems);

  return {
    ...viewData,
    isEditDialogOpen: context.state.isEditDialogOpen,
    editDefaultValues: context.state.editDefaultValues,
    editForm: editLayoutForm,
    flatItems,
  };
};
