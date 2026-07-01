import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolution,
} from "../../internal/projectResolution.js";

const PROJECT_ACTION_MENU_ITEMS = [
  {
    label: "Export",
    type: "item",
    value: "export",
  },
];

export const createInitialState = () => ({
  platform: "web",
  project: {
    name: "",
    description: "",
    iconFileId: undefined,
    resolution: DEFAULT_PROJECT_RESOLUTION,
    source: "local",
  },
  projectActionMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  },
  isProjectExportLoading: false,
  isEditDialogOpen: false,
  isEditIconCropDialogOpen: false,
  editDefaultValues: {
    name: "",
    description: "",
  },
  editIconFileId: undefined,
  editIconCropFile: undefined,
});

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform ?? "web";
};

export const setCurrentProject = ({ state }, { project } = {}) => {
  state.project = {
    name: project?.name ?? "",
    description: project?.description ?? "",
    iconFileId: project?.iconFileId ?? undefined,
    resolution: project?.resolution ?? DEFAULT_PROJECT_RESOLUTION,
    source: project?.source === "cloud" ? "cloud" : "local",
  };
};

export const openProjectActionMenu = ({ state }, { x, y } = {}) => {
  state.projectActionMenu.isOpen = true;
  state.projectActionMenu.x = x ?? 0;
  state.projectActionMenu.y = y ?? 0;
  state.projectActionMenu.items = PROJECT_ACTION_MENU_ITEMS.map((item) => ({
    ...item,
  }));
};

export const closeProjectActionMenu = ({ state }) => {
  state.projectActionMenu.isOpen = false;
  state.projectActionMenu.x = 0;
  state.projectActionMenu.y = 0;
  state.projectActionMenu.items = [];
};

export const selectIsProjectActionMenuOpen = ({ state }) =>
  state.projectActionMenu.isOpen;

export const setProjectExportLoading = ({ state }, { isLoading } = {}) => {
  state.isProjectExportLoading = !!isLoading;
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
  state.isEditIconCropDialogOpen = false;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
  state.editIconFileId = undefined;
  state.editIconCropFile = undefined;
};

export const setEditIconFileId = ({ state }, { iconFileId } = {}) => {
  state.editIconFileId = iconFileId;
};

export const openEditIconCropDialog = ({ state }, { file } = {}) => {
  state.isEditIconCropDialogOpen = true;
  state.editIconCropFile = file;
};

export const closeEditIconCropDialog = ({ state }) => {
  state.isEditIconCropDialogOpen = false;
  state.editIconCropFile = undefined;
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
    isEditIconCropDialogOpen: state.isEditIconCropDialogOpen,
    editDefaultValues: state.editDefaultValues,
    editIconFileId: state.editIconFileId,
    editIconCropFile: state.editIconCropFile,
    editForm: constants.editProjectForm,
    isProjectExportLoading: state.isProjectExportLoading,
    projectExportLoadingStatusText: "Exporting project...",
    projectSource: state.project.source,
    projectActionMenu: state.projectActionMenu,
    showAndroidProjectActions:
      state.platform === "android" && state.project.source === "local",
  };
};
