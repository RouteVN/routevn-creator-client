export const INITIAL_STATE = Object.freeze({
  project: {
    name: "",
    description: "",
    // imageUrl: "/public/project_logo_placeholder.png",
  },
  popover: {
    isOpen: false,
    formConfig: undefined,
    position: {
      x: 0,
      y: 0,
    },
  },
  formConfigs: {
    name: {
      fields: [
        {
          id: "name",
          fieldName: "name",
          inputType: "inputText",
          label: "Name",
          // description: 'Enter your name',
          required: true,
          // validations: [{
          //   rule: /^\w+@\w+\.\w+$/,
          //   message: 'Must be a valid email'
          // }],
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
    description: {
      fields: [
        {
          id: "description",
          fieldName: "description",
          inputType: "inputText",
          label: "Description",
          // description: 'Enter your name',
          required: true,
          // validations: [{
          //   rule: /^\w+@\w+\.\w+$/,
          //   message: 'Must be a valid email'
          // }],
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
  },
});

export const showPopover = (state, { position, formConfig }) => {
  state.popover = {
    isOpen: true,
    position,
    formConfig,
  };
};

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    formConfig: undefined,
    position: {
      x: 0,
      y: 0,
    },
  };
};

export const setProjectName = (state, name) => {
  state.project.name = name;
};

export const setProjectDescription = (state, description) => {
  state.project.description = description;
};

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    form: state.formConfigs[state.popover.formConfig],
  };
};
