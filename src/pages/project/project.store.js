import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolution,
} from "../../internal/projectResolution.js";
import {
  DEFAULT_PROJECT_LANGUAGE,
  normalizeProjectLanguage,
} from "../../internal/projectLanguage.js";
import {
  createProjectLanguageOptions,
  selectProjectLanguageCopy,
  selectProjectLanguageLabel,
} from "../../internal/ui/projectLanguage.js";
import { selectProjectPageCopy } from "./support/projectPageCopy.js";

export const createInitialState = () => ({
  platform: "web",
  project: {
    name: "",
    description: "",
    language: DEFAULT_PROJECT_LANGUAGE,
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
    language: DEFAULT_PROJECT_LANGUAGE,
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
    language: normalizeProjectLanguage(project?.language),
    iconFileId: project?.iconFileId ?? undefined,
    resolution: project?.resolution ?? DEFAULT_PROJECT_RESOLUTION,
    source: project?.source === "cloud" ? "cloud" : "local",
  };
};

export const openProjectActionMenu = ({ state }, { x, y, items } = {}) => {
  state.projectActionMenu.isOpen = true;
  state.projectActionMenu.x = x ?? 0;
  state.projectActionMenu.y = y ?? 0;
  state.projectActionMenu.items = items ?? [];
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
    language: state.project.language,
  };
  state.editIconFileId = state.project.iconFileId ?? undefined;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.isEditIconCropDialogOpen = false;
  state.editDefaultValues = {
    name: "",
    description: "",
    language: DEFAULT_PROJECT_LANGUAGE,
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

export const selectEditDefaultValues = ({ state }) => {
  return state.editDefaultValues;
};

export const selectEditIconFileId = ({ state }) => {
  return state.editIconFileId;
};

export const selectCurrentProject = ({ state }) => {
  return state.project;
};

export const selectIsEditIconCropDialogOpen = ({ state }) => {
  return Boolean(state.isEditIconCropDialogOpen);
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectProjectPageCopy(i18n);
  const projectLanguageCopy = selectProjectLanguageCopy(i18n);
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
      type: "slot",
      slot: "project-language",
      label: projectLanguageCopy.label,
    },
    {
      type: "text",
      label: copy.resolutionLabel,
      value: formatProjectResolution(state.project.resolution),
    },
  ];
  const editForm = {
    title: copy.editProjectTitle,
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.projectNameLabel,
        required: true,
      },
      {
        name: "description",
        type: "input-textarea",
        label: copy.descriptionLabel,
        required: false,
      },
      {
        name: "language",
        type: "select",
        label: projectLanguageCopy.label,
        description: projectLanguageCopy.description,
        required: true,
        clearable: false,
        options: createProjectLanguageOptions(i18n),
      },
      {
        type: "slot",
        slot: "project-icon-edit",
        label: copy.projectIconLabel,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: copy.saveChangesButton,
        },
      ],
    },
  };

  return {
    detailFields,
    projectName: state.project.name ?? "",
    projectDescription: state.project.description ?? "",
    projectLanguage: selectProjectLanguageLabel(i18n, state.project.language),
    projectIconFileId: state.project.iconFileId,
    isEditDialogOpen: state.isEditDialogOpen,
    isEditIconCropDialogOpen: state.isEditIconCropDialogOpen,
    editDefaultValues: state.editDefaultValues,
    editIconFileId: state.editIconFileId,
    editIconCropFile: state.editIconCropFile,
    editForm,
    isProjectExportLoading: state.isProjectExportLoading,
    projectExportLoadingStatusText: copy.exportingProject,
    projectSource: state.project.source,
    projectActionMenu: state.projectActionMenu,
    showNativeProjectActions:
      (state.platform === "android" || state.platform === "ios") &&
      state.project.source === "local",
  };
};
