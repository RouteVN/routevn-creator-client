import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { getInteractionActions } from "../../internal/project/interactionPayload.js";
import {
  BASE_LAYOUT_KEYBOARD_LABELS,
  BASE_LAYOUT_KEYBOARD_OPTIONS,
} from "../../internal/project/layout.js";

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
        { value: "dialogue", label: "Dialogue" },
        { value: "nvl", label: "NVL" },
        { value: "choice", label: "Choice" },
        { value: "base", label: "Base" },
      ],
      tooltip: {
        content:
          "Normal is layout that can be used for background or menu pages. Dialogue is used for ADV mode text dialogue layout. NVL is used for novel mode accumulated dialogue layout. Choice is used for the choices. Base is a general purpose layout type.",
      },
    },
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

const layoutTypeLabels = {
  normal: "Normal",
  dialogue: "Dialogue",
  nvl: "NVL",
  choice: "Choice",
  base: "Base",
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

  const fields = [
    {
      type: "text",
      label: "Layout Type",
      value: layoutTypeLabels[item.layoutType] ?? item.layoutType ?? "",
    },
  ];

  if (item.layoutType === "base") {
    fields.push({
      type: "slot",
      slot: "keyboard-slot",
    });
  }

  return fields;
};

const buildCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "layout",
  subtitle: layoutTypeLabels[item.layoutType] ?? item.layoutType ?? "",
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
  itemType: "layout",
  resourceType: "layouts",
  title: "Layouts",
  selectedResourceId: "layouts",
  resourceCategory: "userInterface",
  addText: "Add Layout",
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, baseViewData }) => ({
    ...baseViewData,
    isAddDialogOpen: state.isAddDialogOpen,
    layoutForm,
    layoutFormDefaults: {
      name: "",
      layoutType: "dialogue",
    },
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

export const selectLayoutItemById = selectItemById;

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
  const baseViewData = selectCatalogViewData(context);
  const selectedItem = selectSelectedItem(context);
  const isBaseLayoutSelected = selectedItem?.layoutType === "base";

  return {
    ...baseViewData,
    isBaseLayoutSelected,
    keyboardItems: toKeyboardItems(selectedItem?.keyboard),
    keyboardEditorKey: context.state.keyboardEditorKey,
    keyboardEditorActions: context.state.keyboardEditorActions,
    keyboardEmptyMessage: "No keyboard actions added yet",
  };
};
