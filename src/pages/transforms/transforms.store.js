import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectTransformsPageCopy } from "./support/transformsPageCopy.js";

const TRANSFORM_TAG_SCOPE_KEY = "transforms";

const createMetadataFormFields = (copy) => [
  {
    name: "name",
    type: "input-text",
    label: copy.nameLabel,
    required: true,
  },
  {
    name: "description",
    type: "input-textarea",
    label: copy.descriptionLabel,
  },
  createTagField({
    label: copy.tagsLabel,
    placeholder: copy.selectTagsPlaceholder,
    addOptionLabel: copy.addTagOption,
  }),
];

const createMetadataForm = ({ title, submitLabel, copy }) => ({
  title,
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: submitLabel,
      },
    ],
  },
  fields: createMetadataFormFields(copy),
});

const createEmptyMetadataValues = () => ({
  name: "",
  description: "",
  tagIds: [],
});

const buildDetailFields = (item, { copy } = {}) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "transform-preview",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "transform-tags",
      label: copy.tagsLabel,
    },
    {
      type: "text",
      label: copy.positionXLabel,
      value: String(item.x ?? 0),
    },
    {
      type: "text",
      label: copy.positionYLabel,
      value: String(item.y ?? 0),
    },
    {
      type: "text",
      label: copy.scaleXLabel,
      value: String(item.scaleX ?? 1),
    },
    {
      type: "text",
      label: copy.scaleYLabel,
      value: String(item.scaleY ?? 1),
    },
    {
      type: "text",
      label: copy.anchorXLabel,
      value: String(item.anchorX ?? 0),
    },
    {
      type: "text",
      label: copy.anchorYLabel,
      value: String(item.anchorY ?? 0),
    },
    {
      type: "text",
      label: copy.rotationLabel,
      value: String(item.rotation ?? 0),
    },
  ];
};

const createDefaultDialogueAvatarMenuItem = (item, state, copy) => ({
  type: "item",
  label:
    item.id === state.defaultDialogueAvatarTransformId
      ? copy.clearDefaultDialogueAvatarMenuItem
      : copy.setDefaultDialogueAvatarMenuItem,
  value:
    item.id === state.defaultDialogueAvatarTransformId
      ? "clear-default-dialogue-avatar"
      : "set-default-dialogue-avatar",
});

const buildTitleIcon = (item, state, copy) => ({
  titleIcon:
    item.id === state.defaultDialogueAvatarTransformId
      ? "characterSprite"
      : undefined,
  titleIconLabel: copy.defaultDialogueAvatarLabel,
});

const buildCatalogItem = (item, { state, copy }) => ({
  ...item,
  ...buildTitleIcon(item, state, copy),
  cardKind: "transform",
  contextMenuItems: [
    ...createTransformCenterItemContextMenuItems(copy),
    createDefaultDialogueAvatarMenuItem(item, state, copy),
  ],
});

const matchesSearch = matchesTagAwareSearch;

const createTransformCenterItemContextMenuItems = (copy) => [
  { label: copy.openButton, type: "item", value: "edit-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const createTransformExplorerItemContextMenuItems = (copy) => [
  { label: copy.openButton, type: "item", value: "edit-item" },
  { label: copy.renameMenuItem, type: "item", value: "rename-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const {
  createInitialState: createCatalogInitialState,
  setItems: setBaseItems,
  setSelectedItemId: setBaseSelectedItemId,
  setSelectedFolderId: setBaseSelectedFolderId,
  setUiConfig,
  setAppWindowMetrics,
  selectIsTabletLandscape,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectTagsData,
  selectActiveTagIds,
  selectDetailTagIds,
  selectCreateTagContext,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "transform",
  resourceType: "transforms",
  title: "",
  selectedResourceId: "transforms",
  resourceCategory: "assets",
  addText: "",
  centerItemContextMenuItems: [],
  emptyMessage: "",
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  copy: selectTransformsPageCopy,
  hiddenMobileDetailSlots: ["transform-preview"],
  tagging: {
    tagFilterPlaceholder: "",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => {
    const detailFields = [...baseViewData.detailFields];
    if (
      selectedItem?.type === "transform" &&
      selectedItem.id === state.defaultDialogueAvatarTransformId
    ) {
      detailFields.push({
        type: "text",
        label: copy.defaultDialogueAvatarLabel,
        value: copy.yesLabel,
      });
    }
    return {
      ...baseViewData,
      detailFields,
      itemContextMenuItems: createTransformExplorerItemContextMenuItems(copy),
      centerItemContextMenuItems:
        createTransformCenterItemContextMenuItems(copy),
      isAddDialogOpen: state.isAddDialogOpen,
      addForm: createMetadataForm({
        title: copy.addTransformTitle,
        submitLabel: copy.addTransformButton,
        copy,
      }),
      addFormDefaults: createEmptyMetadataValues(),
      isEditDialogOpen: state.isEditDialogOpen,
      editForm: createMetadataForm({
        title: copy.editTransformTitle,
        submitLabel: copy.updateTransformButton,
        copy,
      }),
      editDefaultValues: state.editDefaultValues,
      noPreviewImageLabel: copy.noPreviewImageLabel,
      savePreviewInEditorLabel: copy.savePreviewInEditorLabel,
      openButton: copy.openButton,
      selectedItem,
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  isEditDialogOpen: false,
  targetGroupId: undefined,
  editItemId: undefined,
  editDefaultValues: createEmptyMetadataValues(),
  defaultDialogueAvatarTransformId: undefined,
});

export {
  setBaseItems as setItems,
  setBaseSelectedItemId as setSelectedItemId,
  setBaseSelectedFolderId as setSelectedFolderId,
  setUiConfig,
  setAppWindowMetrics,
  selectIsTabletLandscape,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectFolderById,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectTagsData,
  selectActiveTagIds,
  selectDetailTagIds,
  selectCreateTagContext,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectSelectedItemId,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  setSearchQuery,
};

export const selectTransformItemById = selectItemById;

export const setDefaultDialogueAvatarTransformId = (
  { state },
  { transformId },
) => {
  state.defaultDialogueAvatarTransformId = transformId;
};

export const selectDefaultDialogueAvatarTransformId = ({ state }) =>
  state.defaultDialogueAvatarTransformId;

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues.name = defaultValues.name;
  state.editDefaultValues.description = defaultValues.description;
  state.editDefaultValues.tagIds = defaultValues.tagIds;
};

export const closeEditDialog = ({ state }) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = createEmptyMetadataValues();
};

export const selectTargetGroupId = ({ state }) => state.targetGroupId;

export const selectEditItemId = ({ state }) => state.editItemId;

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);
  const copy = selectTransformsPageCopy(context.i18n);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems).map(
      (item) => {
        if (item.type !== "transform") return item;
        return {
          ...item,
          ...buildTitleIcon(item, context.state, copy),
          contextMenuItems: [
            ...viewData.itemContextMenuItems,
            createDefaultDialogueAvatarMenuItem(item, context.state, copy),
          ],
        };
      },
    ),
  };
};

export { TRANSFORM_TAG_SCOPE_KEY };
