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
      inputType: "slot",
      slot: "icon-file-id",
      description: "Project Icon",
    },
  ],
};

export const createInitialState = () => ({
  project: {
    name: "",
    description: "",
    iconFileId: undefined,
  },
  dataLoaded: false,
});

export const setProject = (state, project) => {
  state.project = project;
  state.dataLoaded = true;
};

export const setIconFileId = (state, iconFileId) => {
  state.project.iconFileId = iconFileId;
};

export const selectViewData = ({ state }) => {
  return {
    defaultValues: state.project,
    form,
    dataLoaded: state.dataLoaded,
  };
};
