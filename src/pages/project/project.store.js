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
});

export const setProject = (state, project) => {
  state.project = project;
};

export const setFieldResources = (state, fieldResources) => {
  state.fieldResources = fieldResources;
};

export const toViewData = ({ state }) => {
  const form = createForm(state.fieldResources);
  return {
    defaultValues: state.project,
    form,
  };
};
