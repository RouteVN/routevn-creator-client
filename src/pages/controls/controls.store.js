import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { getInteractionActions } from "../../internal/project/interactionPayload.js";
import { RUNTIME_ACTION_LABELS } from "../../internal/runtimeActions.js";
import {
  BASE_LAYOUT_KEYBOARD_LABELS,
  BASE_LAYOUT_KEYBOARD_OPTIONS,
} from "../../internal/project/layout.js";

const createControlForm = ({ editMode = false } = {}) => ({
  title: editMode ? "Edit Control" : "Add Control",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Control Name",
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
        label: editMode ? "Update Control" : "Add Control",
      },
    ],
  },
});

const SYSTEM_ACTION_LABELS = {
  nextLine: "Next Line",
  sectionTransition: "Transition",
  resetStoryAtSection: "Reset Story At Section",
  toggleAutoMode: "Toggle Auto Mode",
  toggleSkipMode: "Toggle Skip Mode",
  toggleDialogueUI: "Toggle Dialogue Box Visibility",
  pushOverlay: "Push Overlay",
  popOverlay: "Pop Overlay",
  updateVariable: "Update Variable",
  ...RUNTIME_ACTION_LABELS,
};

const toKeyboardItems = (keyboardValue = {}) => {
  const keyboard =
    keyboardValue && typeof keyboardValue === "object" ? keyboardValue : {};

  return Object.entries(keyboard)
    .map(([key, interaction]) => {
      const actions = getInteractionActions(interaction);
      const actionIds = Object.keys(actions);
      const actionLabel =
        actionIds
          .map((actionId) => SYSTEM_ACTION_LABELS[actionId] ?? actionId)
          .join(", ") || "No action";

      return {
        key,
        keyLabel: BASE_LAYOUT_KEYBOARD_LABELS[key] ?? key,
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

const buildDetailFields = (item) => {
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
      slot: "keyboard-slot",
    },
  ];
};

const buildCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "layout",
});

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
  itemType: "control",
  resourceType: "controls",
  title: "Controls",
  selectedResourceId: "controls",
  resourceCategory: "systemConfig",
  addText: "Add",
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, selectedItem, baseViewData }) => ({
    ...baseViewData,
    isDialogOpen: state.isDialogOpen,
    dialogForm: createControlForm({
      editMode: Boolean(state.editItemId),
    }),
    dialogDefaultValues: state.dialogDefaultValues,
    keyboardItems: toKeyboardItems(selectedItem?.keyboard),
    keyboardEditorKey: state.keyboardEditorKey,
    keyboardEditorActions: state.keyboardEditorActions,
    keyboardEmptyMessage: "No keyboard actions added yet",
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
  },
  keyboardEditorKey: undefined,
  keyboardEditorActions: {},
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectControlItemById = selectItemById;

export const selectKeyboardEditorKey = ({ state }) => state.keyboardEditorKey;

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
  state.editItemId = undefined;
  state.dialogDefaultValues = {
    name: "",
    description: "",
  };
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isDialogOpen = true;
  state.targetGroupId = undefined;
  state.editItemId = itemId;
  state.dialogDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = undefined;
  state.editItemId = undefined;
  state.dialogDefaultValues = {
    name: "",
    description: "",
  };
};

export const openKeyboardEditor = ({ state }, { key, actions = {} } = {}) => {
  state.keyboardEditorKey = key;
  state.keyboardEditorActions = actions;
};

export const closeKeyboardEditor = ({ state }, _payload = {}) => {
  state.keyboardEditorKey = undefined;
  state.keyboardEditorActions = {};
};

export const selectViewData = (context) => {
  return selectCatalogViewData(context);
};
