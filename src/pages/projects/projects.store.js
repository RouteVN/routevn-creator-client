export const INITIAL_STATE = Object.freeze({
  title: "Projects",
  createButtonText: "Create Project",
  projects: [],
  isOpen: false,

  defaultValues: {
    name: "",
    description: "",
  },

  form: {
    title: "Create Project",
    description: "Create a new project",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the name of the project",
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
        description: "Enter the description of the project",
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: "Description is required",
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
  }
};

export const setProjects = (state, projects) => {
  state.projects = projects;
};

export const toViewData = ({ state, props }, payload) => {
  return state;
};
