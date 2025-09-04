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

export const INITIAL_STATE = Object.freeze({
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

export const toViewData = ({ state }) => {
  return {
    defaultValues: state.project,
    form,
    dataLoaded: state.dataLoaded,
  };
};
