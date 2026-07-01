import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { getInteractionActions } from "../../internal/project/interactionPayload.js";
import { RUNTIME_ACTION_LABELS } from "../../internal/runtimeActions.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import {
  BASE_LAYOUT_KEYBOARD_LABELS,
  BASE_LAYOUT_KEYBOARD_OPTIONS,
} from "../../internal/project/layout.js";
import { selectControlsPageCopy } from "./support/controlsPageCopy.js";

export const CONTROL_TAG_SCOPE_KEY = "controls";

const createControlForm = ({ editMode = false, copy = {} } = {}) => ({
  title: editMode
    ? (copy.editControlTitle ?? "Edit Control")
    : (copy.addControlTitle ?? "Add Control"),
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.controlNameLabel ?? "Control Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
    createTagField({
      label: copy.tagsLabel ?? "Tags",
      placeholder: copy.selectTagsPlaceholder ?? "Select tags",
      addOptionLabel: copy.addTagOption ?? "Add tag",
    }),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: editMode
          ? (copy.updateControlButton ?? "Update Control")
          : (copy.addControlButton ?? "Add Control"),
      },
    ],
  },
});

const createSystemActionLabels = (copy = {}) => ({
  nextLine: copy.actionNextLine ?? "Next Line",
  sectionTransition: copy.actionSectionTransition ?? "Transition",
  resetStoryAtSection:
    copy.actionResetStoryAtSection ?? "Reset Story At Section",
  toggleAutoMode: copy.actionToggleAutoMode ?? "Toggle Auto Mode",
  toggleSkipMode: copy.actionToggleSkipMode ?? "Toggle Skip Mode",
  startSkipMode: copy.actionStartSkipMode ?? "Start Skip Mode",
  stopSkipMode: copy.actionStopSkipMode ?? "Stop Skip Mode",
  toggleDialogueUI:
    copy.actionToggleDialogueUI ?? "Toggle Dialogue Box Visibility",
  pushOverlay: copy.actionPushOverlay ?? "Push Overlay",
  popOverlay: copy.actionPopOverlay ?? "Pop Overlay",
  updateVariable: copy.actionUpdateVariable ?? "Update Variable",
  setDialogueTextSpeed:
    copy.actionSetDialogueTextSpeed ??
    RUNTIME_ACTION_LABELS.setDialogueTextSpeed,
  setAutoForwardDelay:
    copy.actionSetAutoForwardDelay ?? RUNTIME_ACTION_LABELS.setAutoForwardDelay,
  setSkipUnseenText:
    copy.actionSetSkipUnseenText ?? RUNTIME_ACTION_LABELS.setSkipUnseenText,
  setSkipTransitionsAndAnimations:
    copy.actionSetSkipTransitionsAndAnimations ??
    RUNTIME_ACTION_LABELS.setSkipTransitionsAndAnimations,
  setSoundVolume:
    copy.actionSetSoundVolume ?? RUNTIME_ACTION_LABELS.setSoundVolume,
  setMusicVolume:
    copy.actionSetMusicVolume ?? RUNTIME_ACTION_LABELS.setMusicVolume,
  setMuteAll: copy.actionSetMuteAll ?? RUNTIME_ACTION_LABELS.setMuteAll,
  setSaveLoadPagination:
    copy.actionSetSaveLoadPagination ??
    RUNTIME_ACTION_LABELS.setSaveLoadPagination,
  incrementSaveLoadPagination:
    copy.actionIncrementSaveLoadPagination ??
    RUNTIME_ACTION_LABELS.incrementSaveLoadPagination,
  decrementSaveLoadPagination:
    copy.actionDecrementSaveLoadPagination ??
    RUNTIME_ACTION_LABELS.decrementSaveLoadPagination,
  setMenuPage: copy.actionSetMenuPage ?? RUNTIME_ACTION_LABELS.setMenuPage,
  setMenuEntryPoint:
    copy.actionSetMenuEntryPoint ?? RUNTIME_ACTION_LABELS.setMenuEntryPoint,
});

const KEYBOARD_LABELS = {
  enter: "keyboardEnter",
  space: "keyboardSpace",
  esc: "keyboardEscape",
  ctrl: "keyboardCtrl",
  left: "keyboardLeftArrow",
  right: "keyboardRightArrow",
  up: "keyboardUpArrow",
  down: "keyboardDownArrow",
};

const getKeyboardLabel = (key, copy = {}) => {
  const copyKey = KEYBOARD_LABELS[key];
  return (
    (copyKey ? copy[copyKey] : undefined) ??
    BASE_LAYOUT_KEYBOARD_LABELS[key] ??
    key
  );
};

const toKeyboardItems = (keyboardValue = {}, { copy = {} } = {}) => {
  const keyboard =
    keyboardValue && typeof keyboardValue === "object" ? keyboardValue : {};
  const systemActionLabels = createSystemActionLabels(copy);

  return Object.entries(keyboard)
    .map(([key, interaction]) => {
      const actions = getInteractionActions(interaction);
      const actionIds = Object.keys(actions);
      const actionLabel =
        actionIds
          .map((actionId) => systemActionLabels[actionId] ?? actionId)
          .join(", ") ||
        (copy.noActionLabel ?? "No action");

      return {
        key,
        keyLabel: getKeyboardLabel(key, copy),
        actionLabel,
      };
    })
    .sort((left, right) => {
      const leftIndex = BASE_LAYOUT_KEYBOARD_OPTIONS.findIndex(
        (item) => item.value === left.key,
      );
      const rightIndex = BASE_LAYOUT_KEYBOARD_OPTIONS.findIndex(
        (item) => item.value === right.key,
      );

      if (leftIndex >= 0 && rightIndex >= 0) {
        return leftIndex - rightIndex;
      }
      if (leftIndex >= 0) {
        return -1;
      }
      if (rightIndex >= 0) {
        return 1;
      }
      return left.key.localeCompare(right.key);
    });
};

const buildDetailFields = (item, { copy = {} } = {}) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "control-tags",
      label: copy.tagsLabel ?? "Tags",
    },
    {
      type: "slot",
      slot: "keyboard-slot",
    },
  ];
};

const buildCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "layout",
});

const matchesSearch = (item, searchQuery) =>
  matchesTagAwareSearch(item, searchQuery);

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
  itemType: "control",
  resourceType: "controls",
  title: "Controls",
  selectedResourceId: "controls",
  resourceCategory: "systemConfig",
  addText: "Add",
  copy: selectControlsPageCopy,
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  hiddenMobileDetailSlots: ["keyboard-slot"],
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => ({
    ...baseViewData,
    isDialogOpen: state.isDialogOpen,
    dialogForm: createControlForm({
      editMode: Boolean(state.editItemId),
      copy,
    }),
    dialogDefaultValues: state.dialogDefaultValues,
    keydownKeyboardItems: toKeyboardItems(selectedItem?.keyboard, { copy }),
    keyupKeyboardItems: toKeyboardItems(selectedItem?.keyup, { copy }),
    keyboardEditorKey: state.keyboardEditorKey,
    keyboardEditorPhase: state.keyboardEditorPhase,
    keyboardEditorActions: state.keyboardEditorActions,
    keydownKeyboardLabel: copy.keydownKeyboardLabel ?? "Keydown",
    keyupKeyboardLabel: copy.keyupKeyboardLabel ?? "Keyup",
    keydownKeyboardEmptyMessage:
      copy.keydownKeyboardEmptyMessage ?? "No keydown actions added yet",
    keyupKeyboardEmptyMessage:
      copy.keyupKeyboardEmptyMessage ?? "No keyup actions added yet",
  }),
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isDialogOpen: false,
  targetGroupId: undefined,
  editItemId: undefined,
  dialogDefaultValues: {
    name: "",
    description: "",
    tagIds: [],
  },
  keyboardEditorKey: undefined,
  keyboardEditorPhase: "keydown",
  keyboardEditorActions: {},
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

export const selectControlItemById = selectItemById;

export const selectKeyboardEditorKey = ({ state }) => state.keyboardEditorKey;
export const selectKeyboardEditorPhase = ({ state }) =>
  state.keyboardEditorPhase;

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
  state.editItemId = undefined;
  state.dialogDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
  };
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isDialogOpen = true;
  state.targetGroupId = undefined;
  state.editItemId = itemId;
  state.dialogDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
    tagIds: defaultValues?.tagIds ?? [],
  };
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = undefined;
  state.editItemId = undefined;
  state.dialogDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
  };
};

export const openKeyboardEditor = (
  { state },
  { phase = "keydown", key, actions = {} } = {},
) => {
  state.keyboardEditorPhase = phase;
  state.keyboardEditorKey = key;
  state.keyboardEditorActions = actions;
};

export const closeKeyboardEditor = ({ state }, _payload = {}) => {
  state.keyboardEditorKey = undefined;
  state.keyboardEditorPhase = "keydown";
  state.keyboardEditorActions = {};
};

export const selectViewData = (context) => {
  return selectCatalogViewData(context);
};
