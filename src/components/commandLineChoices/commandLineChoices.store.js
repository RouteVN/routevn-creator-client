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

    state.editForm.text = choice.text || "";
    state.editForm.variables = ""; // placeholder
    state.editForm.actionType = choice.action?.type || "continue";
    state.editForm.sceneId = choice.action?.sceneId || "";
    state.editForm.sectionId = choice.action?.sectionId || "";
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
    actionTypeOptions,
    editModeTitle,
    breadcrumb,
  };

  console.log("[toViewData] Returning view data:", viewData);
  return viewData;
};
