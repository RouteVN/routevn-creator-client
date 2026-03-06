export const createInitialState = () => ({
  project: {
    name: "",
    description: "",
    iconFileId: undefined,
    source: "local",
  },
});

export const setCurrentProject = ({ state }, { project } = {}) => {
  state.project = {
    name: project?.name ?? "",
    description: project?.description ?? "",
    iconFileId: project?.iconFileId ?? null,
    source: project?.source === "cloud" ? "cloud" : "local",
  };
};

export const setIconFileId = ({ state }, { iconFileId } = {}) => {
  state.project.iconFileId = iconFileId;
};

export const selectViewData = ({ state, constants }) => {
  return {
    defaultValues: state.project,
    form: constants.projectForm,
    projectSource: state.project.source,
  };
};
