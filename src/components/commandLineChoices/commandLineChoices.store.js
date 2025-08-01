const CHOICE_FORM_TEMPLATE = Object.freeze({
  title: 'Edit Choice',
  fields: [
    {
      name: "text",
      inputType: "inputText",
      label: "Choice Text",
      required: true,
      placeholder: "Enter choice text",
    },
    {
      name: "variables",
      inputType: "inputText",
      label: "Update Variables",
      required: false,
      placeholder: "Variable updates",
    },
    {
      name: "actionType",
      inputType: "select",
      label: "Action",
      required: true,
      options: [
        { value: "continue", label: "Continue (Do Nothing)" },
        { value: "moveToScene", label: "Move to Scene" },
        { value: "moveToSection", label: "Move to Section" },
      ],
    },
    {
      name: "sceneId",
      inputType: "inputText",
      label: "Target Scene ID",
      required: false,
      placeholder: "Scene ID",
      condition: { field: "actionType", value: "moveToScene" },
    },
    {
      name: "sectionId",
      inputType: "inputText",
      label: "Target Section ID",
      required: false,
      placeholder: "Section ID",
      condition: { field: "actionType", value: "moveToSection" },
    },
  ],
});

export const INITIAL_STATE = Object.freeze({
  mode: "list", // "list" or "editChoice"
  choices: [
    { text: "Choice 1", action: { type: "continue" } },
    { text: "Choice 2", action: { type: "continue" } },
  ],
  selectedLayoutId: "",
  editingIndex: -1,
  editForm: {
    text: "",
    variables: "", // placeholder for now
    actionType: "continue", // "continue", "moveToScene", "moveToSection"
    sceneId: "",
    sectionId: "",
  },
  choiceFormTemplate: CHOICE_FORM_TEMPLATE,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    choiceIndex: null,
    items: [{ label: "Delete", type: "item", value: "delete" }],
  },
});

export const setMode = (state, mode) => {
  state.mode = mode;
};

export const setEditingIndex = (state, index) => {
  console.log("[setEditingIndex] Setting editing index:", index);
  console.log("[setEditingIndex] Current state:", state);

  state.editingIndex = index;

  if (index >= 0 && state.choices && state.choices[index]) {
    const choice = state.choices[index];
    console.log("[setEditingIndex] Editing existing choice:", choice);

    // Ensure all values are strings and properly escaped
    state.editForm.text = String(choice.text || "");
    state.editForm.variables = ""; // placeholder
    state.editForm.actionType = String(choice.action?.type || "continue");
    state.editForm.sceneId = String(choice.action?.sceneId || "");
    state.editForm.sectionId = String(choice.action?.sectionId || "");
  } else {
    // New choice or reset
    console.log("[setEditingIndex] Creating new choice form");

    state.editForm.text = "";
    state.editForm.variables = "";
    state.editForm.actionType = "continue";
    state.editForm.sceneId = "";
    state.editForm.sectionId = "";
  }

  console.log("[setEditingIndex] Final editForm:", state.editForm);
};

export const updateEditForm = (state, { field, value }) => {
  state.editForm[field] = value;
};

export const addChoice = (state) => {
  state.choices.push({
    text: `Choice ${state.choices.length + 1}`,
    action: { type: "continue" },
  });
};

export const removeChoice = (state, index) => {
  if (state.choices.length > 1) {
    state.choices.splice(index, 1);
  }
};

export const saveChoice = (state) => {
  const { editingIndex, editForm } = state;

  const action = { type: editForm.actionType };
  if (editForm.actionType === "moveToScene" && editForm.sceneId) {
    action.sceneId = editForm.sceneId;
  } else if (editForm.actionType === "moveToSection" && editForm.sectionId) {
    action.sectionId = editForm.sectionId;
  }

  const choiceData = {
    text: editForm.text,
    action,
  };

  if (editingIndex >= 0) {
    // Update existing choice
    state.choices[editingIndex] = choiceData;
  } else {
    // Add new choice
    state.choices.push(choiceData);
  }

  // Reset form and mode
  state.mode = "list";
  state.editingIndex = -1;
};

export const updateChoice = (state, { index, text, target }) => {
  if (state.choices[index]) {
    if (text !== undefined) state.choices[index].text = text;
    if (target !== undefined) state.choices[index].target = target;
  }
};

export const setSelectedLayoutId = (state, payload) => {
  state.selectedLayoutId = payload.layoutId;
};

export const showDropdownMenu = (state, { position, choiceIndex }) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.choiceIndex = choiceIndex;
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.choiceIndex = null;
};

export const selectDropdownMenuChoiceIndex = ({ state }) => {
  return state.dropdownMenu.choiceIndex;
};

// Selectors
export const selectMode = ({ state }) => state?.mode || "list";
export const selectEditingIndex = ({ state }) => state?.editingIndex || -1;
export const selectEditForm = ({ state }) =>
  state?.editForm || {
    text: "",
    variables: "",
    actionType: "continue",
    sceneId: "",
    sectionId: "",
  };
export const selectChoices = ({ state }) => state?.choices || [];
export const selectSelectedLayoutId = ({ state }) =>
  state?.selectedLayoutId || "";

const form = {
  fields: [
    {
      name: "layoutId",
      inputType: "select",
      label: "Choices Layout",
      required: false,
      options: '${layoutOptions}',
    },
    {
      inputType: "slot",
      slot: "choices",
      description: "Choices",
    },
  ],
};

export const toViewData = ({ state, props }, payload) => {
  console.log("[toViewData] Called with state:", state, "props:", props);

  const layouts = props?.layouts || [];

  const layoutOptions = layouts.map((layout) => ({
    value: layout?.id || "",
    label: layout?.name || "",
  }));

  const actionTypeOptions = [
    { value: "continue", label: "Continue (Do Nothing)" },
    { value: "moveToScene", label: "Move to Scene" },
    { value: "moveToSection", label: "Move to Section" },
  ];

  // Pre-compute complex expressions for template
  const processedChoices = (state?.choices || []).map((choice) => ({
    ...choice,
    actionLabel:
      choice.action?.type === "continue"
        ? "Continue"
        : choice.action?.type === "moveToScene"
          ? "Move to Scene"
          : "Move to Section",
  }));

  const editModeTitle =
    (state?.editingIndex || -1) >= 0 ? "Edit Choice" : "Add New Choice";

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
  ];

  if (state?.mode === "editChoice") {
    breadcrumb.push({
      id: "list",
      label: "Choices",
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
    layoutOptions: layoutOptions,
  };


  // Create defaultValues with choices data
  const defaultValues = {
    layoutId: state?.selectedLayoutId || "",
    choices: processedChoices,
    text: state?.editForm?.text || "",
    variables: state?.editForm?.variables || "",
    actionType: state?.editForm?.actionType || "continue",
    sceneId: state?.editForm?.sceneId || "",
    sectionId: state?.editForm?.sectionId || "",
  };

  const viewData = {
    mode: state?.mode || "list",
    choices: processedChoices,
    layouts: layoutOptions,
    selectedLayoutId: state?.selectedLayoutId || "",
    editingIndex: state?.editingIndex || -1,
    editForm: state?.editForm || {
      text: "",
      variables: "",
      actionType: "continue",
      sceneId: "",
      sectionId: "",
    },
    defaultValues,
    actionTypeOptions,
    editModeTitle,
    breadcrumb,
    choiceFormTemplate: CHOICE_FORM_TEMPLATE,
    form,
    context,
    dropdownMenu: state.dropdownMenu,
  };

  console.log("[toViewData] Returning view data:", viewData);
  return viewData;
};
