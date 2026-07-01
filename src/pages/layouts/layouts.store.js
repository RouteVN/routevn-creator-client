import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { isFragmentLayout } from "../../internal/project/layout.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectLayoutsPageCopy } from "./support/layoutsPageCopy.js";

export const LAYOUT_TAG_SCOPE_KEY = "layouts";

const createFragmentField = (copy = {}) => ({
  name: "isFragment",
  type: "segmented-control",
  label: copy.canBeUsedAsFragmentLabel ?? "Can Be Used As Fragment",
  clearable: false,
  options: [
    { value: false, label: copy.noLabel ?? "No" },
    { value: true, label: copy.yesLabel ?? "Yes" },
  ],
});

const createLayoutDescriptionField = (copy = {}) => ({
  name: "description",
  type: "input-textarea",
  label: copy.descriptionLabel ?? "Description",
});

const createLayoutTypeOptions = (copy = {}) => [
  { value: "general", label: copy.layoutTypeGeneral ?? "General" },
  { value: "input", label: copy.layoutTypeInput ?? "Input" },
  { value: "save-load", label: copy.layoutTypeSaveLoad ?? "Save / Load" },
  {
    value: "confirmDialog",
    label: copy.layoutTypeConfirmDialog ?? "Confirm Dialog",
  },
  { value: "history", label: copy.layoutTypeHistory ?? "History" },
  {
    value: "dialogue-adv",
    label: copy.layoutTypeDialogueAdv ?? "Dialogue ADV",
  },
  {
    value: "dialogue-nvl",
    label: copy.layoutTypeDialogueNvl ?? "Dialogue NVL",
  },
  { value: "choice", label: copy.layoutTypeChoice ?? "Choice" },
];

const createLayoutForm = (copy = {}) => ({
  title: copy.addTitle ?? "Add Layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.layoutNameLabel ?? "Layout Name",
      required: true,
    },
    {
      name: "layoutType",
      type: "select",
      label: copy.layoutTypeLabel ?? "Layout Type",
      required: true,
      options: createLayoutTypeOptions(copy),
      tooltip: {
        content:
          copy.layoutTypeTooltip ??
          "General is the flexible layout type for backgrounds, menus, and other all-purpose screens. Input is used for form input layouts. Save / Load is used for save-slot based save and load screens. Confirm Dialog is used for compact confirmation prompts with OK and Cancel areas. History is used for dialogue history overlays. Dialogue ADV is used for ADV mode text dialogue layout. Dialogue NVL is used for novel mode accumulated dialogue layout. Choice is used for the choices.",
      },
    },
    createLayoutDescriptionField(copy),
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
    createFragmentField(copy),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.addButton ?? "Add Layout",
      },
    ],
  },
});

const createEditLayoutForm = (copy = {}) => ({
  title: copy.editTitle ?? "Edit Layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.layoutNameLabel ?? "Layout Name",
      required: true,
    },
    createLayoutDescriptionField(copy),
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
    createFragmentField(copy),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton ?? "Save",
      },
    ],
  },
});

const createLayoutExplorerItemContextMenuItems = (copy = {}) => [
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createLayoutCenterItemContextMenuItems = (copy = {}) => [
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createLayoutTypeLabels = (copy = {}) => ({
  general: copy.layoutTypeGeneral ?? "General",
  input: copy.layoutTypeInput ?? "Input",
  "save-load": copy.layoutTypeSaveLoad ?? "Save / Load",
  confirmDialog: copy.layoutTypeConfirmDialog ?? "Confirm Dialog",
  history: copy.layoutTypeHistory ?? "History",
  "dialogue-adv": copy.layoutTypeDialogueAdv ?? "Dialogue ADV",
  "dialogue-nvl": copy.layoutTypeDialogueNvl ?? "Dialogue NVL",
  choice: copy.layoutTypeChoice ?? "Choice",
});

const buildDetailFields = (item, { copy = {} } = {}) => {
  if (!item || item.type !== "layout") {
    return [];
  }

  const layoutType = item.layoutType;
  const layoutTypeLabels = createLayoutTypeLabels(copy);
  const fields = [
    {
      type: "slot",
      slot: "actions",
    },
    {
      type: "text",
      label: copy.layoutTypeLabel ?? "Layout Type",
      value: layoutTypeLabels[layoutType] ?? layoutType ?? "",
    },
    {
      type: "text",
      label: copy.fragmentLabel ?? "Fragment",
      value: isFragmentLayout(item)
        ? (copy.yesLabel ?? "Yes")
        : (copy.noLabel ?? "No"),
    },
    {
      type: "slot",
      slot: "layout-tags",
      label: copy.tagsLabel ?? "Tags",
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

const buildCatalogItem = (item, { copy = {} } = {}) => {
  const layoutType = item.layoutType;
  const layoutTypeLabels = createLayoutTypeLabels(copy);
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
  setSelectedFolderId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "layout",
  resourceType: "layouts",
  title: "Layouts",
  selectedResourceId: "layouts",
  resourceCategory: "userInterface",
  addText: "Add",
  copy: selectLayoutsPageCopy,
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildCatalogItem,
  hiddenMobileDetailSlots: ["actions"],
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, baseViewData, copy }) => ({
    ...baseViewData,
    itemContextMenuItems: createLayoutExplorerItemContextMenuItems(copy),
    centerItemContextMenuItems: createLayoutCenterItemContextMenuItems(copy),
    openLayoutEditorButton: copy.openLayoutEditorButton ?? "Open Layout Editor",
    isAddDialogOpen: state.isAddDialogOpen,
    layoutForm: createLayoutForm(copy),
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
  setSelectedFolderId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
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
  const copy = selectLayoutsPageCopy(context.i18n);

  return {
    ...viewData,
    isEditDialogOpen: context.state.isEditDialogOpen,
    editDefaultValues: context.state.editDefaultValues,
    editForm: createEditLayoutForm(copy),
    flatItems,
  };
};
