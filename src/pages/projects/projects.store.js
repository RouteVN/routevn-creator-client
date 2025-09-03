export const INITIAL_STATE = Object.freeze({
  title: "Projects",
  createButtonText: "Create Project",
  projects: [],
  isOpen: false,
  projectPath: "",
  projectPathDisplay: "No folder selected",

  defaultValues: {
    name: "",
    description: "",
    projectPath: "",
    template: "default",
  },

  form: {
    title: "Create Project",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Project Name",
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: "Name is required",
          },
        ],
      },
      {
        name: "description",
        inputType: "inputText",
        label: "Description",
        description: "Enter a brief description of the project",
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: "Description is required",
          },
        ],
      },
      {
        name: "template",
        inputType: "select",
        label: "Template",
        required: true,
        options: [{ value: "default", label: "Default" }],
      },
      {
        name: "projectPath",
        inputType: "slot",
        slot: "project-path-selector",
        label: "Project Location",
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: "Project location is required",
          },
        ],
      },
    ],
    actions: {
      layout: "", // vertical, fill, right, left
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Submit",
          type: "submit",
        },
      ],
    },
  },
});

export const toggleDialog = (state) => {
  state.isOpen = !state.isOpen;
  // Reset form when closing
  if (!state.isOpen) {
    state.defaultValues.name = "";
    state.defaultValues.description = "";
    state.defaultValues.projectPath = "";
    state.defaultValues.template = "default";
    state.projectPath = "";
    state.projectPathDisplay = "No folder selected";
  }
};

export const setProjects = (state, projects) => {
  state.projects = projects;
};

export const setProjectPath = (state, path) => {
  state.projectPath = path; // Update top-level for binding
  state.defaultValues.projectPath = path; // Update defaultValues for form
  state.projectPathDisplay = path || "No folder selected";
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const selectProjectPath = ({ state }) => {
  return state.defaultValues.projectPath;
};

export const toViewData = ({ state, props }, payload) => {
  return state;
};
