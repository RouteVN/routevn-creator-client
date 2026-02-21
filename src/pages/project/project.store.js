const form = {
  fields: [
    {
      name: "name",
      type: "popover-input",
      label: "Project Name",
      required: true,
    },
    {
      name: "description",
      type: "popover-input",
      label: "Description",
      required: true,
    },
    {
      type: "slot",
      slot: "icon-file-id",
      label: "Project Icon",
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

export const setProject = ({ state }, { project } = {}) => {
  state.project = project;
  state.dataLoaded = true;
};

export const setIconFileId = ({ state }, { iconFileId } = {}) => {
  state.project.iconFileId = iconFileId;
};

export const selectViewData = ({ state }) => {
  return {
    defaultValues: state.project,
    form,
    dataLoaded: state.dataLoaded,
  };
};
