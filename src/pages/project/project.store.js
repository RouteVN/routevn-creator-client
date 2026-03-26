import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolution,
} from "../../internal/projectResolution.js";

export const createInitialState = () => ({
  project: {
    name: "",
    description: "",
    iconFileId: undefined,
    resolution: DEFAULT_PROJECT_RESOLUTION,
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
    resolution: project?.resolution ?? DEFAULT_PROJECT_RESOLUTION,
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
      slot: "project-title",
      label: "",
    },
    {
      type: "slot",
      slot: "project-icon",
      label: "",
    },
    {
      type: "slot",
      slot: "project-description",
      label: "",
    },
    {
      type: "text",
      label: "Resolution",
      value: formatProjectResolution(state.project.resolution),
    },
  ];

  return {
    detailFields,
    projectName: state.project.name ?? "",
    projectDescription: state.project.description ?? "",
    projectIconFileId: state.project.iconFileId,
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues: state.editDefaultValues,
    editIconFileId: state.editIconFileId,
    editForm: constants.editProjectForm,
    projectSource: state.project.source,
  };
};
