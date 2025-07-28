const createForm = (params) => {
  const { iconSrc } = params;
  return {
    fields: [
      {
        name: "name",
        inputType: "popover-input",
        description: "Project Name",
        required: true,
      },
      {
        name: "description",
        inputType: "popover-input",
        description: "Description",
        required: true,
      },
      {
        name: "iconFileId",
        inputType: "image",
        description: "Image URL",
        src: iconSrc,
        required: false,
        width: 120,
        height: 120,
      },
    ],
  };
};

export const INITIAL_STATE = Object.freeze({
  project: {
    name: "",
    description: "",
    imageUrl: "/public/project_logo_placeholder.png",
  },
  fieldResources: {},
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
          name: "name",
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
          name: "description",
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

export const setProject = (state, project) => {
  state.project = project;
};

export const setProjectName = (state, name) => {
  state.project.name = name;
};

export const setFieldResources = (state, fieldResources) => {
  state.fieldResources = fieldResources;
};

export const setProjectDescription = (state, description) => {
  state.project.description = description;
};

export const setProjectImageUrl = (state, imageUrl) => {
  state.project.imageUrl = imageUrl;
};

export const toViewData = ({ state, props }, payload) => {
  const form = createForm(state.fieldResources);
  return {
    defaultValues: state.project,
    form,
  };
};
