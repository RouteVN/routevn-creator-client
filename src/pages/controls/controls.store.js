import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { getInteractionActions } from "../../internal/project/interactionPayload.js";
import {
  BASE_LAYOUT_KEYBOARD_LABELS,
  BASE_LAYOUT_KEYBOARD_OPTIONS,
} from "../../internal/project/layout.js";

const controlForm = {
  title: "Add Control",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Control Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Control",
      },
    ],
  },
};

const SYSTEM_ACTION_LABELS = {
  nextLine: "Next Line",
  sectionTransition: "Transition",
  toggleAutoMode: "Toggle Auto Mode",
  toggleSkipMode: "Toggle Skip Mode",
  toggleDialogueUI: "Toggle Dialogue Box",
  pushLayeredView: "Push Layered View",
  popLayeredView: "Pop Layered View",
  updateVariable: "Update Variable",
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
  addText: "Add Control",
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, selectedItem, baseViewData }) => ({
    ...baseViewData,
    isAddDialogOpen: state.isAddDialogOpen,
    controlForm,
    controlFormDefaults: {
      name: "",
    },
    keyboardItems: toKeyboardItems(selectedItem?.keyboard),
    keyboardEditorKey: state.keyboardEditorKey,
    keyboardEditorActions: state.keyboardEditorActions,
    keyboardEmptyMessage: "No keyboard actions added yet",
  }),
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  targetGroupId: undefined,
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
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
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
