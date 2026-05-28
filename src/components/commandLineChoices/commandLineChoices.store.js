import { toFlatItems } from "../../internal/project/tree.js";
import { getTransitionAnimationOptions } from "../../internal/animationOptions.js";

const CHOICE_UPDATE_VARIABLE_ALLOWED_MODES = Object.freeze(["updateVariable"]);

const CHOICE_FORM_TEMPLATE = Object.freeze({
  title: "Edit Choice",
  fields: [
    {
      name: "content",
      type: "input-text",
      label: "Choice Content",
      required: true,
      placeholder: "Enter choice content",
    },
    {
      name: "actionType",
      type: "segmented-control",
      label: "Action",
      required: true,
      options: [
        { value: "nextLine", label: "Continue" },
        { value: "sectionTransition", label: "Move to Section" },
      ],
    },
    {
      $when: `values.actionType == 'sectionTransition'`,
      name: "sceneId",
      type: "select",
      label: "Scene",
      options: "${scenes}",
    },
    {
      $when: `values.actionType == 'sectionTransition'`,
      name: "sectionId",
      type: "select",
      label: "Section",
      options: "${sections}",
    },
    {
      $when: `values.actionType == 'sectionTransition'`,
      name: "transitionAnimationId",
      type: "select",
      label: "Screen",
      required: false,
      clearable: true,
      placeholder: "Animation",
      options: "${transitionAnimationOptions}",
    },
    {
      type: "slot",
      slot: "updateVariables",
      label: "Update Variables",
    },
  ],
});

const toPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const getChoiceLayoutOptions = (layouts = []) => {
  return layouts
    .filter((layout) => layout.layoutType === "choice")
    .map((layout) => ({
      value: layout?.id || "",
      label: layout?.name || "",
    }));
};

const resolveSelectedResourceId = ({ layouts, resourceId } = {}) => {
  const resourceOptions = getChoiceLayoutOptions(layouts);

  if (
    resourceId &&
    resourceOptions.some(
      (resourceOption) => resourceOption.value === resourceId,
    )
  ) {
    return resourceId;
  }

  return resourceOptions[0]?.value ?? "";
};

const getDropdownMenuItems = (choiceIndex, itemCount) => [
  { label: "Move Up", type: "item", value: "moveUp" },
  { label: "Move Down", type: "item", value: "moveDown" },
  { label: "Delete", type: "item", value: "delete" },
];

const createNextLineChoice = (content) => ({
  content,
  events: {
    click: {
      actions: {
        nextLine: {},
      },
    },
  },
});

const getChoiceClickActions = (choice = {}) => {
  return toPlainObject(choice.events?.click?.actions);
};

const createChoiceUpdateVariableActions = (updateVariable) => {
  const actions = {};

  if (updateVariable !== undefined) {
    actions.updateVariable = updateVariable;
  }

  return actions;
};

export const createInitialState = () => ({
  mode: "list", // "list" or "editChoice"
  items: [createNextLineChoice("Choice 1"), createNextLineChoice("Choice 2")],
  selectedResourceId: "",
  editingIndex: -1,
  editForm: {
    // content: "",
    actionType: "nextLine",
    updateVariable: undefined,
    // sceneId,
    // sectionId,
  },
  choiceFormTemplate: CHOICE_FORM_TEMPLATE,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    choiceIndex: null,
    items: [
      { label: "Move Up", type: "item", value: "moveUp"},
      { label: "Move Down", type: "item", value: "moveDown"},
      { label: "Delete", type: "item", value: "delete" }
    ],
  },
  scenes: {
    items: {},
    tree: [],
  },
  animations: {
    items: {},
    tree: [],
  },
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setEditingIndex = ({ state }, { index } = {}) => {
  state.editingIndex = index;

  if (index >= 0 && state.items && state.items[index]) {
    const choice = state.items[index];
    const clickActions = getChoiceClickActions(choice);

    state.editForm.content = choice.content || "";
    state.editForm.updateVariable = clickActions.updateVariable;
    if (clickActions.sectionTransition) {
      state.editForm.actionType = "sectionTransition";
      state.editForm.sceneId = clickActions.sectionTransition?.sceneId;
      state.editForm.sectionId = clickActions.sectionTransition?.sectionId;
      state.editForm.transitionAnimationId =
        clickActions.sectionTransition?.screen?.animations?.resourceId;
    } else if (clickActions.nextLine) {
      state.editForm.actionType = "nextLine";
      state.editForm.sceneId = "";
      state.editForm.sectionId = "";
      state.editForm.transitionAnimationId = "";
    } else {
      state.editForm.actionType = "nextLine";
      state.editForm.sceneId = "";
      state.editForm.sectionId = "";
      state.editForm.transitionAnimationId = "";
    }
  } else {
    // New choice or reset

    state.editForm.content = "";
    state.editForm.actionType = "nextLine";
    state.editForm.updateVariable = undefined;
    state.editForm.sceneId = "";
    state.editForm.sectionId = "";
    state.editForm.transitionAnimationId = "";
  }
};

export const updateEditForm = ({ state }, { field, value } = {}) => {
  state.editForm[field] = value;
};

const buildChoiceDataFromEditForm = (editForm = {}) => {
  const actions = {};

  if (editForm.updateVariable !== undefined) {
    actions.updateVariable = editForm.updateVariable;
  }

  if (editForm.actionType === "nextLine") {
    actions.nextLine = {};
  } else if (editForm.actionType === "sectionTransition") {
    const sectionTransition = {
      sceneId: editForm.sceneId,
      sectionId: editForm.sectionId,
    };

    if (editForm.transitionAnimationId) {
      sectionTransition.screen = {
        animations: {
          resourceId: editForm.transitionAnimationId,
        },
      };
    }

    actions.sectionTransition = sectionTransition;
  }

  return {
    content: editForm.content,
    events: {
      click: {
        actions,
      },
    },
  };
};

export const addChoice = ({ state }, _payload = {}) => {
  state.items.push(createNextLineChoice(`Choice ${state.items.length + 1}`));
};

export const removeChoice = ({ state }, { index } = {}) => {
  if (
    state.items.length <= 1 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.items.length
  ) {
    return;
  }

  state.items.splice(index, 1);
};

export const moveChoice = ({ state }, { index, direction } = {}) => {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (!Number.isInteger(index) || targetIndex < 0 || targetIndex >= state.items.length) {
    return;
  }

  const items = [...state.items];
  const [item] = items.splice(index, 1);
  items.splice(targetIndex, 0, item);
  state.items = items;
};

export const setScenes = ({ state }, { scenes } = {}) => {
  state.scenes = scenes;
};

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations ?? { items: {}, tree: [] };
};

export const saveChoice = ({ state }, _payload = {}) => {
  const { editingIndex, editForm } = state;
  const choiceData = buildChoiceDataFromEditForm(editForm);

  if (editingIndex >= 0) {
    // Update existing choice
    state.items[editingIndex] = choiceData;
  } else {
    // Add new choice
    state.items.push(choiceData);
  }

  // Reset form and mode
  state.mode = "list";
  state.editingIndex = -1;
};

export const updateChoice = ({ state }, { index, content, target } = {}) => {
  if (state.items[index]) {
    if (content !== undefined) state.items[index].content = content;
    if (target !== undefined) state.items[index].target = target;
  }
};

export const setSelectedResourceId = ({ state }, { resourceId } = {}) => {
  state.selectedResourceId = resourceId;
};

export const showDropdownMenu = ({ state }, { position, choiceIndex } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.choiceIndex = choiceIndex;
  state.dropdownMenu.items = getDropdownMenuItems(choiceIndex, state.items.length);
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.choiceIndex = null;
};

export const setItems = ({ state }, { items } = {}) => {
  state.items = Array.isArray(items) ? items : [];
};

export const selectDropdownMenuChoiceIndex = ({ state }) => {
  return state.dropdownMenu.choiceIndex;
};

// Selectors
export const selectMode = ({ state }) => state?.mode || "list";
export const selectEditingIndex = ({ state }) => state?.editingIndex ?? -1;
export const selectEditForm = ({ state }) =>
  state?.editForm || {
    content: "",
    variables: "",
    actionType: "nextLine",
    sceneId: "",
    sectionId: "",
    updateVariable: undefined,
  };
export const selectItems = ({ state }) => state?.items || [];
export const selectItemsWithEditingDraft = ({ state }) => {
  const items = [...(state?.items || [])];

  if (state?.mode !== "editChoice") {
    return items;
  }

  const choiceData = buildChoiceDataFromEditForm(state.editForm);
  const editingIndex = state?.editingIndex ?? -1;

  if (editingIndex >= 0 && items[editingIndex]) {
    items[editingIndex] = choiceData;
  } else {
    items.push(choiceData);
  }

  return items;
};
export const selectSelectedResourceId = ({ state }) =>
  state?.selectedResourceId || "";

const form = {
  fields: [
    {
      name: "resourceId",
      type: "select",
      label: "Choices Layout",
      required: false,
      clearable: false,
      options: "${resourceOptions}",
    },
    {
      type: "slot",
      slot: "choices",
      description: "Choices",
    },
  ],
};

export const selectViewData = ({ state, props }) => {
  const layouts = props?.layouts || [];
  const allScenes = toFlatItems(state.scenes).filter(
    (item) => item.type === "scene",
  );
  const scenes = allScenes.map((item) => {
    return {
      label: item.name,
      value: item.id,
    };
  });

  const selectedScene = allScenes.find(
    (scene) => scene.id === state.editForm.sceneId,
  );

  let sections = [];
  if (selectedScene) {
    sections = toFlatItems(selectedScene.sections).map((item) => {
      return {
        label: item.name,
        value: item.id,
      };
    });
  }

  const resourceOptions = getChoiceLayoutOptions(layouts);
  const selectedResourceId = resolveSelectedResourceId({
    layouts,
    resourceId: state.selectedResourceId,
  });

  // Pre-compute complex expressions for template
  const processedItems = (state?.items || []).map((item) => ({
    ...item,
  }));

  const editModeTitle =
    (state?.editingIndex ?? -1) >= 0 ? "Edit Choice" : "Add New Choice";

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state?.mode === "editChoice") {
    breadcrumb.push({
      id: "list",
      label: "Choices",
      click: true,
    });
    breadcrumb.push({
      label: editModeTitle,
    });
  } else {
    breadcrumb.push({
      label: "Choices",
    });
  }

  // Create context for form template
  const context = {
    resourceOptions: resourceOptions,
  };

  const editFormContext = {
    values: state.editForm,
    scenes,
    sections,
    transitionAnimationOptions: getTransitionAnimationOptions(
      state.animations,
      state.editForm.transitionAnimationId,
    ),
  };
  const choiceUpdateVariableActions = createChoiceUpdateVariableActions(
    state.editForm.updateVariable,
  );

  // Create defaultValues with items data
  const defaultValues = {
    resourceId: selectedResourceId,
    items: processedItems,
    content: state?.editForm?.content || "",
    actionType: state?.editForm?.actionType,
    sceneId: state?.editForm?.sceneId,
    sectionId: state?.editForm?.sectionId,
    transitionAnimationId: state?.editForm?.transitionAnimationId,
  };

  const dropdownMenu = {
    ...state.dropdownMenu,
    items: getDropdownMenuItems(
      state.dropdownMenu.choiceIndex,
      state.items.length,
    ),
  };

  const viewData = {
    mode: state?.mode || "list",
    items: processedItems,
    layouts: resourceOptions,
    selectedResourceId,
    editingIndex: state?.editingIndex ?? -1,
    editForm: state?.editForm,
    editFormContext,
    defaultValues,
    editModeTitle,
    breadcrumb,
    choiceFormTemplate: CHOICE_FORM_TEMPLATE,
    choiceUpdateVariableActions,
    choiceUpdateVariableAllowedModes: CHOICE_UPDATE_VARIABLE_ALLOWED_MODES,
    form,
    context,
    dropdownMenu,
  };

  return viewData;
};
