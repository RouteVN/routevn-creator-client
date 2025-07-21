export const INITIAL_STATE = Object.freeze({
  title: "Projects",
  createButtonText: "Create Project",
  projects: [
    {
      id: "1",
      name: "Project 1",
      description: "Project 1 description",
    },
    {
      id: "2",
      name: "Project 2",
      description: "Project 2 description",
    },
  ],
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
            rule: /^\w+@\w+\.\w+$/,
            message: "Must be a valid email",
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
            rule: /^\w+$/,
            message: "Must be a valid password",
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
        },
      ],
    },
  },
});

export const toggleDialog = (state) => {
  state.isOpen = !state.isOpen;
};

export const toViewData = ({ state, props }, payload) => {
  return state;
};
