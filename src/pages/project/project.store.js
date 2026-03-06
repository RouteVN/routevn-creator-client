export const createInitialState = () => ({
  project: {
    name: "",
    description: "",
    iconFileId: undefined,
    source: "local",
  },
  isEditDialogOpen: false,
  editDefaultValues: {
    name: "",
    description: "",
  },
  editIconFileId: undefined,
});

export const setCurrentProject = ({ state }, { project } = {}) => {
  state.project = {
    name: project?.name ?? "",
    description: project?.description ?? "",
    iconFileId: project?.iconFileId ?? undefined,
    source: project?.source === "cloud" ? "cloud" : "local",
  };
};

export const openEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = true;
  state.editDefaultValues = {
    name: state.project.name ?? "",
    description: state.project.description ?? "",
  };
  state.editIconFileId = state.project.iconFileId ?? undefined;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
  state.editIconFileId = undefined;
};

export const setEditIconFileId = ({ state }, { iconFileId } = {}) => {
  state.editIconFileId = iconFileId;
};

export const selectViewData = ({ state, constants }) => {
  const detailFields = [
    {
      type: "slot",
      slot: "project-icon",
      label: "",
    },
    {
      type: "text",
      label: "Name",
      value: state.project.name ?? "",
    },
    {
      type: "text",
      label: "Source",
      value: state.project.source ?? "local",
    },
    {
      type: "description",
      value: state.project.description ?? "",
    },
    {
      type: "slot",
      slot: "edit-action",
      label: "",
    },
  ];

  return {
    detailFields,
    projectIconFileId: state.project.iconFileId,
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues: state.editDefaultValues,
    editIconFileId: state.editIconFileId,
    editForm: constants.editProjectForm,
    projectSource: state.project.source,
  };
};
