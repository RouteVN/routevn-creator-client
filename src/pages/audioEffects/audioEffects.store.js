import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  getAudioEffectKeyframesDuration,
  getTransitionFadeKeyframes,
} from "../../internal/audioEffectDefinition.js";
import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectAudioEffectsPageCopy } from "./support/audioEffectsPageCopy.js";

export const AUDIO_EFFECT_TAG_SCOPE_KEY = "audioEffects";

const getAudioEffectTypeLabel = (type, copy = {}) =>
  type === "transition"
    ? (copy.transitionType ?? "Transition")
    : (copy.updateType ?? "Update");

const getAudioEffectPropertyLabel = (property, copy = {}) => {
  const labels = {
    volume: copy.volumePropertyLabel ?? "Volume",
    pan: copy.panPropertyLabel ?? "Pan",
    playbackRate: copy.playbackRatePropertyLabel ?? "Playback Rate",
  };
  return labels[property] ?? property;
};

const createUpdateTimelineProperties = (tween = {}, copy = {}) =>
  Object.fromEntries(
    Object.entries(tween).map(([property, config]) => [
      property,
      {
        ...structuredClone(config),
        label: getAudioEffectPropertyLabel(property, copy),
      },
    ]),
  );

const createFadeTimelineProperties = ({ definition, side, copy } = {}) => {
  const keyframes = getTransitionFadeKeyframes(definition, side);
  if (keyframes.length === 0) {
    return {};
  }

  const previous = side === "prev";
  return {
    fade: {
      label: copy.fadePropertyLabel ?? "Fade",
      initialValue: previous ? 100 : 0,
      keyframes: structuredClone(keyframes),
    },
  };
};

const getTransitionTimelineDuration = (definition = {}) =>
  Math.max(
    ...["prev", "next"].map((side) =>
      getAudioEffectKeyframesDuration(
        getTransitionFadeKeyframes(definition, side),
      ),
    ),
  );

const formatAudioEffectSummary = (item, copy = {}) => {
  const definition = item?.audioEffect;
  if (definition?.type === "transition") {
    const sides = [];
    if (definition.prev?.fade) {
      sides.push(
        `${copy.previousLabel ?? "Previous"}: ${getAudioEffectKeyframesDuration(getTransitionFadeKeyframes(definition, "prev"))}ms`,
      );
    }
    if (definition.next?.fade) {
      sides.push(
        `${copy.nextLabel ?? "Next"}: ${getAudioEffectKeyframesDuration(getTransitionFadeKeyframes(definition, "next"))}ms`,
      );
    }
    return sides.join(" · ");
  }

  const properties = Object.keys(definition?.tween ?? {});
  return properties.length > 0
    ? properties
        .map((property) => getAudioEffectPropertyLabel(property, copy))
        .join(", ")
    : (copy.noPropertiesLabel ?? "No properties");
};

const createMetadataFormFields = (copy = {}) => [
  {
    name: "name",
    type: "input-text",
    label: copy.nameLabel ?? "Name",
    required: true,
  },
  {
    name: "description",
    type: "input-textarea",
    label: copy.descriptionLabel ?? "Description",
  },
  createTagField({
    label: copy.tagsLabel,
    placeholder: copy.selectTagsPlaceholder,
    addOptionLabel: copy.addTagOption,
  }),
];

const createAddForm = (copy = {}) => ({
  title: copy.addTitle ?? "Add Audio Effect",
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: copy.createButton ?? "Create",
      },
    ],
  },
  fields: [
    ...createMetadataFormFields(copy),
    {
      name: "dialogType",
      type: "segmented-control",
      label: copy.typeLabel ?? "Type",
      noClear: true,
      required: true,
      options: [
        { label: copy.updateType ?? "Update", value: "update" },
        {
          label: copy.transitionType ?? "Transition",
          value: "transition",
        },
      ],
    },
  ],
});

const createEditForm = (copy = {}) => ({
  title: copy.editTitle ?? "Edit Audio Effect",
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: copy.updateButton ?? "Update",
      },
    ],
  },
  fields: createMetadataFormFields(copy),
});

const createExplorerItemContextMenuItems = (copy = {}) => [
  { label: copy.openButton ?? "Open", type: "item", value: "edit-item" },
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

const createCenterItemContextMenuItems = (copy = {}) => [
  { label: copy.openButton ?? "Open", type: "item", value: "edit-item" },
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

const buildCatalogItem = (item, { copy = {} } = {}) => {
  const definition = item.audioEffect ?? {};
  const transition = definition.type === "transition";
  return {
    ...item,
    audioEffectType: transition ? "transition" : "update",
    audioEffectTypeLabel: getAudioEffectTypeLabel(definition.type, copy),
    animationType: transition ? "transition" : "update",
    animationTypeLabel: getAudioEffectTypeLabel(definition.type, copy),
    cardKind: "animation",
    itemWidth: "f",
    prevProperties: transition
      ? createFadeTimelineProperties({ definition, side: "prev", copy })
      : {},
    nextProperties: transition
      ? createFadeTimelineProperties({ definition, side: "next", copy })
      : {},
    updateProperties: transition
      ? {}
      : createUpdateTimelineProperties(definition.tween, copy),
    transitionTimelineDuration: transition
      ? getTransitionTimelineDuration(definition)
      : 0,
    transitionPreviousLabel: copy.previousLabel ?? "Previous",
    transitionNextLabel: copy.nextLabel ?? "Next",
    timelineDefaultValues: {
      volume: 100,
      pan: 0,
      playbackRate: 1,
    },
    summary: formatAudioEffectSummary(item, copy),
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
  itemType: "audioEffect",
  resourceType: "audioEffects",
  title: "Audio Effects",
  selectedResourceId: "audioEffects",
  resourceCategory: "animatedAssets",
  addText: "Add",
  copy: selectAudioEffectsPageCopy,
  buildCatalogItem,
  matchesSearch: matchesTagAwareSearch,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => ({
    ...baseViewData,
    itemContextMenuItems: createExplorerItemContextMenuItems(copy),
    centerItemContextMenuItems: createCenterItemContextMenuItems(copy),
    isAddDialogOpen: state.isAddDialogOpen,
    addForm: createAddForm(copy),
    addFormDefaults: {
      name: "",
      description: "",
      tagIds: [],
      dialogType: "update",
    },
    isEditDialogOpen: state.isEditDialogOpen,
    editForm: createEditForm(copy),
    editDefaultValues: state.editDefaultValues,
    selectedItemDescription: selectedItem?.description ?? "",
    selectedAudioEffectTypeLabel: selectedItem?.audioEffect?.type
      ? getAudioEffectTypeLabel(selectedItem.audioEffect.type, copy)
      : "",
    selectedAudioEffectSummary: selectedItem
      ? formatAudioEffectSummary(selectedItem, copy)
      : "",
    descriptionLabel: copy.descriptionLabel ?? "Description",
    tagsLabel: copy.tagsLabel ?? "Tags",
    typeLabel: copy.typeLabel ?? "Type",
    configurationLabel: copy.configurationLabel ?? "Configuration",
    openButton: copy.openButton ?? "Open",
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
};

export const selectAudioEffectItemById = selectItemById;
export const selectTargetGroupId = ({ state }) => state.targetGroupId;
export const selectEditItemId = ({ state }) => state.editItemId;

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
  state.editDefaultValues.name = defaultValues?.name ?? "";
  state.editDefaultValues.description = defaultValues?.description ?? "";
  state.editDefaultValues.tagIds = defaultValues?.tagIds ?? [];
};

export const closeEditDialog = ({ state }) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues.name = "";
  state.editDefaultValues.description = "";
  state.editDefaultValues.tagIds = [];
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);
  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
