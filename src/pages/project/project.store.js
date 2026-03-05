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
  projectSource: "local",
  dataLoaded: false,
});

export const setCurrentProject = ({ state }, { project } = {}) => {
  state.project = {
    name: project?.name || "",
    description: project?.description || "",
    iconFileId: project?.iconFileId || null,
  };
  state.projectSource = project?.source === "cloud" ? "cloud" : "local";
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
    projectSource: state.projectSource,
    projectSourceLabel: state.projectSource === "cloud" ? "Cloud" : "Local",
  };
};
