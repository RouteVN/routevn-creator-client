const CHOICE_FORM_TEMPLATE = Object.freeze({
  title: "Edit Choice",
  fields: [
    {
      name: "content",
      inputType: "inputText",
      label: "Choice Content",
      required: true,
      placeholder: "Enter choice content",
    },
    // {
    //   name: "variables",
    //   inputType: "inputText",
    //   label: "Update Variables",
    //   required: false,
    //   placeholder: "Variable updates",
    // },
    // {
    //   name: "actionType",
    //   inputType: "select",
    //   label: "Action",
    //   required: true,
    //   options: [
    //     { value: "continue", label: "Continue (Do Nothing)" },
    //     { value: "moveToScene", label: "Move to Scene" },
    //     { value: "moveToSection", label: "Move to Section" },
    //   ],
    // },
    // {
    //   name: "sceneId",
    //   inputType: "inputText",
    //   label: "Target Scene ID",
    //   required: false,
    //   placeholder: "Scene ID",
    //   condition: { field: "actionType", value: "moveToScene" },
    // },
    // {
    //   name: "sectionId",
    //   inputType: "inputText",
    //   label: "Target Section ID",
    //   required: false,
    //   placeholder: "Section ID",
    //   condition: { field: "actionType", value: "moveToSection" },
    // },
  ],
});

export const INITIAL_STATE = Object.freeze({
  mode: "list", // "list" or "editChoice"
  items: [
    { content: "Choice 1", action: { type: "continue" } },
    { content: "Choice 2", action: { type: "continue" } },
  ],
  selectedLayoutId: "",
  editingIndex: -1,
  editForm: {
    content: "",
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
  state.editingIndex = index;

  if (index >= 0 && state.items && state.items[index]) {
    const choice = state.items[index];

    // Ensure all values are strings and properly escaped
    state.editForm.content = String(choice.content || "");
    state.editForm.variables = ""; // placeholder
    state.editForm.actionType = String(choice.action?.type || "continue");
    state.editForm.sceneId = String(choice.action?.sceneId || "");
    state.editForm.sectionId = String(choice.action?.sectionId || "");
  } else {
    // New choice or reset

    state.editForm.content = "";
    state.editForm.variables = "";
    state.editForm.actionType = "continue";
    state.editForm.sceneId = "";
    state.editForm.sectionId = "";
  }
};

export const updateEditForm = (state, { field, value }) => {
  state.editForm[field] = value;
};

export const addChoice = (state) => {
  state.items.push({
    content: `Choice ${state.items.length + 1}`,
    action: { type: "continue" },
  });
};

export const removeChoice = (state, index) => {
  if (state.items.length > 1) {
    state.items.splice(index, 1);
  }
};

export const saveChoice = (state) => {
  const { editingIndex, editForm } = state;

  // const action = { type: editForm.actionType };
  // if (editForm.actionType === "moveToScene" && editForm.sceneId) {
  //   action.sceneId = editForm.sceneId;
  // } else if (editForm.actionType === "moveToSection" && editForm.sectionId) {
  //   action.sectionId = editForm.sectionId;
  // }

  const choiceData = {
    content: editForm.content,
    // action,
  };

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

export const updateChoice = (state, { index, content, target }) => {
  if (state.items[index]) {
    if (content !== undefined) state.items[index].content = content;
    if (target !== undefined) state.items[index].target = target;
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
export const selectEditingIndex = ({ state }) => state?.editingIndex ?? -1;
export const selectEditForm = ({ state }) =>
  state?.editForm || {
    content: "",
    variables: "",
    actionType: "continue",
    sceneId: "",
    sectionId: "",
  };
export const selectItems = ({ state }) => state?.items || [];
export const selectSelectedLayoutId = ({ state }) =>
  state?.selectedLayoutId || "";

const form = {
  fields: [
    {
      name: "layoutId",
      inputType: "select",
      label: "Choices Layout",
      required: false,
      options: "${layoutOptions}",
    },
    {
      inputType: "slot",
      slot: "choices",
      description: "Choices",
    },
  ],
};

export const toViewData = ({ state, props }, payload) => {
  const layouts = props?.layouts || [];

  const layoutOptions = layouts
    .filter((layout) => layout.layoutType === "choice")
    .map((layout) => ({
      value: layout?.id || "",
      label: layout?.name || "",
    }));

  const actionTypeOptions = [
    { value: "continue", label: "Continue (Do Nothing)" },
    { value: "moveToScene", label: "Move to Scene" },
    { value: "moveToSection", label: "Move to Section" },
  ];

  // Pre-compute complex expressions for template
  const processedItems = (state?.items || []).map((item) => ({
    ...item,
    actionLabel:
      item.action?.type === "continue"
        ? "Continue"
        : item.action?.type === "moveToScene"
          ? "Move to Scene"
          : "Move to Section",
  }));

  const editModeTitle =
    (state?.editingIndex ?? -1) >= 0 ? "Edit Choice" : "Add New Choice";

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

  // Create defaultValues with items data
  const defaultValues = {
    layoutId: state?.selectedLayoutId || "",
    items: processedItems,
    content: state?.editForm?.content || "",
    variables: state?.editForm?.variables || "",
    actionType: state?.editForm?.actionType || "continue",
    sceneId: state?.editForm?.sceneId || "",
    sectionId: state?.editForm?.sectionId || "",
  };

  const viewData = {
    mode: state?.mode || "list",
    items: processedItems,
    layouts: layoutOptions,
    selectedLayoutId: state?.selectedLayoutId || "",
    editingIndex: state?.editingIndex ?? -1,
    editForm: state?.editForm || {
      content: "",
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

  return viewData;
};
