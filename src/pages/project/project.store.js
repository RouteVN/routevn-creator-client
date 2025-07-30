const form = {
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
      src: "${iconFileId.src}",
      required: false,
      width: 120,
      height: 120,
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  project: {
    name: "",
    description: "",
    iconFileId: undefined,
  },
  context: {
    iconFileId: {
      src: "/public/project_logo_placeholder.png",
    },
  },
});

export const setProject = (state, project) => {
  state.project = project;
};

export const setContext = (state, context) => {
  state.context = context;
};

export const toViewData = ({ state }) => {
  return {
    defaultValues: state.project,
    form,
    context: state.context,
  };
};
