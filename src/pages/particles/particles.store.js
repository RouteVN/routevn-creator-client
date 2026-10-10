import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  createDuplicateItemName,
  toFlatItems,
} from "../../internal/project/tree.js";
import { resolveParticleTextureImageItem } from "../../internal/particles.js";
import { formatParticleAspectRatio } from "../../internal/particlePreview.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  buildTagFilterOptions,
  matchesTagAwareSearch,
} from "../../internal/resourceTags.js";
import {
  buildParticleCatalogItem,
  buildParticleDetailFields,
} from "./support/particleDetails.js";
import {
  DEFAULT_PARTICLE_PRESET_ID,
  createParticlePresetOptions,
} from "./support/particlePresets.js";
import { selectParticlesPageCopy } from "./support/particlesPageCopy.js";

const EMPTY_TREE = {
  items: {},
  tree: [],
};

export const PARTICLE_TAG_SCOPE_KEY = "particles";

const createMetadataFormFields = ({ copy, tagOptions }) => [
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
    options: tagOptions,
  }),
];

const createMetadataForm = ({ title, submitLabel, fields }) => ({
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
  fields,
});

// A new particle starts from a preset; its texture is picked in the editor.
const createAddForm = ({ copy, tagOptions }) =>
  createMetadataForm({
    title: copy.addParticleTitle,
    submitLabel: copy.addParticleButton,
    fields: [
      ...createMetadataFormFields({ copy, tagOptions }),
      {
        name: "presetId",
        type: "select",
        label: copy.presetLabel,
        tooltip: {
          content: copy.presetDescription,
        },
        required: true,
        clearable: false,
        options: createParticlePresetOptions(copy),
      },
    ],
  });

const createEditForm = ({ copy, tagOptions }) =>
  createMetadataForm({
    title: copy.editParticleTitle,
    submitLabel: copy.updateParticleButton,
    fields: createMetadataFormFields({ copy, tagOptions }),
  });

const createEmptyMetadataValues = () => ({
  name: "",
  description: "",
  tagIds: [],
});

const createAddFormDefaults = () => ({
  ...createEmptyMetadataValues(),
  presetId: DEFAULT_PARTICLE_PRESET_ID,
});

const createParticleCenterItemContextMenuItems = (copy) => [
  { label: copy.openButton, type: "item", value: "edit-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const createParticleExplorerItemContextMenuItems = (copy) => [
  { label: copy.openButton, type: "item", value: "edit-item" },
  { label: copy.renameMenuItem, type: "item", value: "rename-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  setSelectedFolderId,
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
  itemType: "particle",
  resourceType: "particles",
  title: "Particles",
  selectedResourceId: "particles",
  resourceCategory: "animatedAssets",
  addText: "Add",
  emptyMessage: "No particle effects found",
  copy: selectParticlesPageCopy,
  matchesSearch: matchesTagAwareSearch,
  buildCatalogItem: buildParticleCatalogItem,
  hiddenMobileDetailSlots: ["particle-preview"],
  tagging: {
    tagFilterPlaceholder: "",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => {
    const selectedTextureImageItem = resolveParticleTextureImageItem(
      selectedItem?.modules?.appearance?.texture,
      state.imagesData.items,
    );
    const tagOptions = buildTagFilterOptions({
      tagsCollection: state.tagsData,
    });

    return {
      ...baseViewData,
      detailFields: selectedItem
        ? buildParticleDetailFields({
            item: selectedItem,
            imagesData: state.imagesData,
            copy,
          })
        : baseViewData.detailFields,
      itemContextMenuItems: createParticleExplorerItemContextMenuItems(copy),
      centerItemContextMenuItems:
        createParticleCenterItemContextMenuItems(copy),
      isAddDialogOpen: state.isAddDialogOpen,
      addForm: createAddForm({ copy, tagOptions }),
      addFormDefaults: createAddFormDefaults(),
      isEditDialogOpen: state.isEditDialogOpen,
      editForm: createEditForm({ copy, tagOptions }),
      editDefaultValues: state.editDefaultValues,
      selectedPreviewAspectRatio: formatParticleAspectRatio(selectedItem),
      selectedTextureImageFileId:
        selectedTextureImageItem?.thumbnailFileId ??
        selectedTextureImageItem?.fileId,
      selectedTextureImageName: selectedTextureImageItem?.name ?? "",
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
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  imagesData: EMPTY_TREE,
});

export {
  setItems,
  setSelectedItemId,
  setSelectedFolderId,
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

export const selectParticleItemById = selectItemById;
export const selectSelectedParticle = selectSelectedItem;

// The folder an item is in, which its items do not record.
export const selectItemParentId = ({ state }, { itemId } = {}) =>
  toFlatItems(state.data).find((item) => item.id === itemId)?.parentId;

export const selectDuplicateItemName = ({ state }, { itemId } = {}) =>
  createDuplicateItemName(state.data, itemId);

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
};

export const selectProjectResolution = ({ state }) => state.projectResolution;

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData ?? EMPTY_TREE;
};

export const selectImagesData = ({ state }) => state.imagesData;

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

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
