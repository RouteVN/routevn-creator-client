import { normalizeTheme } from "../../internal/theme.js";
import {
  formatProjectsPageCopy,
  selectProjectsPageCopy,
} from "./support/projectsPageCopy.js";

export const createInitialState = () => ({
  isTouchMode: false,
  localTitle: "",
  cloudTitle: "",
  showCloudProjects: false,
  loginButtonText: "",
  createButtonText: "",
  createCloudButtonText: "",
  openButtonText: "",
  isLoggedIn: false,
  userEmail: "",
  userName: "",
  userDisplayColor: "#E2E8F0",
  userAvatar: "",
  avatarInitial: "U",
  projects: [],
  cloudProjects: [],
  platform: "tauri",
  appVersion: "",
  currentLocale: "en",
  currentTheme: "dark",

  profileMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  },

  mobileActionMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  },

  appVersionMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  },

  languageDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      locale: "en",
    },
  },

  appearanceDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      theme: "dark",
    },
  },

  profileDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      displayName: "",
      displayColor: "#E2E8F0",
      avatar: "",
    },
  },

  settingsDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      email: "",
    },
  },

  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetScope: "local",
    targetProjectId: null,
    targetProjectPath: "",
    items: [],
  },

  deleteDialog: {
    isOpen: false,
    projectId: null,
    projectPath: "",
    projectName: "",
  },

  createDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {},
  },

  cloudCreateDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      name: "",
      description: "",
    },
  },

  addMemberDialog: {
    isOpen: false,
    projectId: null,
    projectName: "",
    formKey: 0,
    defaultValues: {
      email: "",
    },
  },
});

export const setProjects = ({ state }, { projects } = {}) => {
  state.projects = projects;
};

export const addProject = ({ state }, { project } = {}) => {
  if (!project?.id) {
    return;
  }

  const existingIndex = state.projects.findIndex(
    (entry) => entry?.id === project.id,
  );
  if (existingIndex === -1) {
    state.projects.push(project);
    return;
  }

  state.projects[existingIndex] = project;
};

export const setCloudProjects = ({ state }, { projects } = {}) => {
  state.cloudProjects = Array.isArray(projects) ? projects : [];
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const addCloudProject = ({ state }, { project } = {}) => {
  if (!project) {
    return;
  }
  state.cloudProjects.unshift(project);
};

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform;
};

export const setAppVersion = ({ state }, { version } = {}) => {
  state.appVersion = version ?? "";
};

export const setCurrentLocale = ({ state }, { locale } = {}) => {
  state.currentLocale = locale ?? "en";
};

export const setCurrentTheme = ({ state }, { theme } = {}) => {
  state.currentTheme = normalizeTheme(theme);
};

export const setAuthUser = ({ state }, { user } = {}) => {
  const name = user?.name?.trim?.() || "";
  const email = user?.email?.trim?.() || "";
  const displayColor = user?.displayColor || "#E2E8F0";
  const avatar = user?.avatar?.trim?.() || "";
  const initialSource = name || email || "U";

  state.isLoggedIn = Boolean(email);
  state.userName = name;
  state.userEmail = email;
  state.userDisplayColor = displayColor;
  state.userAvatar = avatar;
  state.avatarInitial = initialSource[0].toUpperCase();
};

export const removeProject = ({ state }, { projectId, projectPath } = {}) => {
  state.projects = state.projects.filter((project) => {
    if (projectId && project?.id === projectId) {
      return false;
    }

    if (projectPath && project?.projectPath === projectPath) {
      return false;
    }

    return true;
  });
};

export const openProfileMenu = ({ state }, { x, y, items } = {}) => {
  state.profileMenu.isOpen = true;
  state.profileMenu.x = x;
  state.profileMenu.y = y;
  state.profileMenu.items = items ?? [];
};

export const closeProfileMenu = ({ state }, _payload = {}) => {
  state.profileMenu.isOpen = false;
  state.profileMenu.x = 0;
  state.profileMenu.y = 0;
  state.profileMenu.items = [];
};

export const openProfileDialog = ({ state }, _payload = {}) => {
  state.profileDialog.isOpen = true;
  state.profileDialog.formKey += 1;
  state.profileDialog.defaultValues = {
    displayName: state.userName || "",
    displayColor: state.userDisplayColor || "#E2E8F0",
    avatar: state.userAvatar || "",
  };
};

export const closeProfileDialog = ({ state }, _payload = {}) => {
  state.profileDialog.isOpen = false;
};

export const selectIsProfileMenuOpen = ({ state }) => {
  return Boolean(state.profileMenu?.isOpen);
};

export const openMobileActionMenu = ({ state }, { x, y, items } = {}) => {
  state.mobileActionMenu.isOpen = true;
  state.mobileActionMenu.x = x;
  state.mobileActionMenu.y = y;
  state.mobileActionMenu.items = items ?? [];
};

export const closeMobileActionMenu = ({ state }, _payload = {}) => {
  state.mobileActionMenu.isOpen = false;
  state.mobileActionMenu.x = 0;
  state.mobileActionMenu.y = 0;
  state.mobileActionMenu.items = [];
};

export const selectIsMobileActionMenuOpen = ({ state }) => {
  return Boolean(state.mobileActionMenu?.isOpen);
};

export const openAppVersionMenu = ({ state }, { x, y, items } = {}) => {
  state.appVersionMenu.isOpen = true;
  state.appVersionMenu.x = x;
  state.appVersionMenu.y = y;
  state.appVersionMenu.items = items ?? [];
};

export const closeAppVersionMenu = ({ state }, _payload = {}) => {
  state.appVersionMenu.isOpen = false;
  state.appVersionMenu.x = 0;
  state.appVersionMenu.y = 0;
  state.appVersionMenu.items = [];
};

export const selectIsAppVersionMenuOpen = ({ state }) => {
  return Boolean(state.appVersionMenu?.isOpen);
};

export const openLanguageDialog = ({ state }, { locale } = {}) => {
  state.languageDialog.isOpen = true;
  state.languageDialog.formKey += 1;
  state.languageDialog.defaultValues = {
    locale: locale ?? state.currentLocale ?? "en",
  };
};

export const closeLanguageDialog = ({ state }, _payload = {}) => {
  state.languageDialog.isOpen = false;
};

export const selectIsLanguageDialogOpen = ({ state }) => {
  return Boolean(state.languageDialog?.isOpen);
};

export const openAppearanceDialog = ({ state }, { theme } = {}) => {
  state.appearanceDialog.isOpen = true;
  state.appearanceDialog.formKey += 1;
  state.appearanceDialog.defaultValues = {
    theme: normalizeTheme(theme ?? state.currentTheme),
  };
};

export const closeAppearanceDialog = ({ state }, _payload = {}) => {
  state.appearanceDialog.isOpen = false;
};

export const selectIsAppearanceDialogOpen = ({ state }) => {
  return Boolean(state.appearanceDialog?.isOpen);
};

export const selectIsProfileDialogOpen = ({ state }) => {
  return Boolean(state.profileDialog?.isOpen);
};

export const openSettingsDialog = ({ state }, _payload = {}) => {
  state.settingsDialog.isOpen = true;
  state.settingsDialog.formKey += 1;
  state.settingsDialog.defaultValues = {
    email: state.userEmail || "",
  };
};

export const closeSettingsDialog = ({ state }, _payload = {}) => {
  state.settingsDialog.isOpen = false;
};

export const selectIsSettingsDialogOpen = ({ state }) => {
  return Boolean(state.settingsDialog?.isOpen);
};

export const selectProjects = ({ state }) => {
  return state.projects;
};

export const selectCloudProjects = ({ state }) => {
  return state.cloudProjects;
};

export const selectShowCloudProjects = ({ state }) => {
  return Boolean(state.showCloudProjects);
};

export const openCloudCreateDialog = ({ state }, _payload = {}) => {
  state.cloudCreateDialog.isOpen = true;
  state.cloudCreateDialog.formKey += 1;
  state.cloudCreateDialog.defaultValues = {
    name: "",
    description: "",
  };
};

export const closeCloudCreateDialog = ({ state }, _payload = {}) => {
  state.cloudCreateDialog.isOpen = false;
};

export const selectIsCloudCreateDialogOpen = ({ state }) => {
  return Boolean(state.cloudCreateDialog?.isOpen);
};

export const selectDropdownMenuTargetProjectId = ({ state }) => {
  return state.dropdownMenu.targetProjectId;
};

export const selectDropdownMenuTargetProjectPath = ({ state }) => {
  return state.dropdownMenu.targetProjectPath || "";
};

export const selectDropdownMenuTargetScope = ({ state }) => {
  return state.dropdownMenu.targetScope || "local";
};

export const selectIsProjectDropdownMenuOpen = ({ state }) => {
  return Boolean(state.dropdownMenu?.isOpen);
};

export const openDropdownMenu = (
  { state },
  { x, y, scope = "local", projectId, projectPath, items } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetScope = scope;
  state.dropdownMenu.targetProjectId = projectId;
  state.dropdownMenu.targetProjectPath = projectPath ?? "";
  state.dropdownMenu.items = Array.isArray(items) ? items : [];
};

export const closeDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetScope = "local";
  state.dropdownMenu.targetProjectId = null;
  state.dropdownMenu.targetProjectPath = "";
  state.dropdownMenu.items = [];
};

export const openDeleteDialog = (
  { state },
  { projectId, projectPath, projectName = "" } = {},
) => {
  state.deleteDialog.isOpen = true;
  state.deleteDialog.projectId = projectId || null;
  state.deleteDialog.projectPath = projectPath ?? "";
  state.deleteDialog.projectName = projectName;
};

export const closeDeleteDialog = ({ state }, _payload = {}) => {
  state.deleteDialog.isOpen = false;
  state.deleteDialog.projectId = null;
  state.deleteDialog.projectPath = "";
  state.deleteDialog.projectName = "";
};

export const selectDeleteDialogProjectId = ({ state }) => {
  return state.deleteDialog.projectId;
};

export const selectDeleteDialogProjectPath = ({ state }) => {
  return state.deleteDialog.projectPath || "";
};

export const selectIsDeleteDialogOpen = ({ state }) => {
  return Boolean(state.deleteDialog?.isOpen);
};

export const openCreateDialog = ({ state }, _payload = {}) => {
  state.createDialog.isOpen = true;
  state.createDialog.formKey += 1;
  state.createDialog.defaultValues = {};
};

export const closeCreateDialog = ({ state }, _payload = {}) => {
  state.createDialog.isOpen = false;
};

export const selectIsCreateDialogOpen = ({ state }) => {
  return Boolean(state.createDialog?.isOpen);
};

export const openAddMemberDialog = (
  { state },
  { projectId, projectName = "" } = {},
) => {
  state.addMemberDialog.isOpen = true;
  state.addMemberDialog.projectId = projectId || null;
  state.addMemberDialog.projectName = projectName;
  state.addMemberDialog.formKey += 1;
  state.addMemberDialog.defaultValues = {
    email: "",
  };
};

export const closeAddMemberDialog = ({ state }, _payload = {}) => {
  state.addMemberDialog.isOpen = false;
  state.addMemberDialog.projectId = null;
  state.addMemberDialog.projectName = "";
};

export const selectAddMemberDialogProjectId = ({ state }) => {
  return state.addMemberDialog.projectId;
};

export const selectIsAddMemberDialogOpen = ({ state }) => {
  return Boolean(state.addMemberDialog?.isOpen);
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectProjectsPageCopy(i18n);
  const deleteDialogProjectName = state.deleteDialog.projectName
    ? `"${state.deleteDialog.projectName}"`
    : copy.removeProjectTargetFallback;
  const profileDisplayName =
    state.userName || state.userEmail || copy.profileDefaultName;
  const avatarImageSrc =
    state.userAvatar || "/public/project_logo_placeholder.png";
  const profileDialogForm = {
    title: copy.editProfileTitle,
    fields: [
      {
        name: "displayName",
        type: "input-text",
        label: copy.displayNameLabel,
      },
      {
        name: "displayColor",
        type: "color-picker",
        label: copy.displayColorLabel,
      },
      {
        name: "avatar",
        type: "input-text",
        label: copy.avatarLabel,
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton,
        },
        {
          id: "save",
          variant: "pr",
          label: copy.saveButton,
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const settingsDialogForm = {
    title: copy.settingsTitle,
    fields: [
      {
        name: "email",
        type: "input-text",
        label: copy.emailLabel,
        required: true,
        validations: [
          {
            rule: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: copy.validEmailMessage,
          },
        ],
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton,
        },
        {
          id: "save",
          variant: "pr",
          label: copy.saveButton,
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const cloudCreateForm = {
    title: copy.createCloudProjectTitle,
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.projectNameLabel,
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: copy.projectNameRequiredMessage,
          },
        ],
      },
      {
        name: "description",
        type: "input-text",
        label: copy.descriptionLabel,
        description: copy.optionalLabel,
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton,
        },
        {
          id: "create-cloud",
          variant: "pr",
          label: copy.createProjectMenuItem,
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const addMemberDialogTitle = state.addMemberDialog.projectName
    ? formatProjectsPageCopy(copy.addMemberTitleWithProject, {
        projectName: state.addMemberDialog.projectName,
      })
    : copy.addMemberTitle;
  const addMemberForm = {
    title: addMemberDialogTitle,
    fields: [
      {
        name: "email",
        type: "input-text",
        label: copy.emailLabel,
        required: true,
        validations: [
          {
            rule: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: copy.validEmailMessage,
          },
        ],
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton,
        },
        {
          id: "submit-add-member",
          variant: "pr",
          label: copy.submitButton,
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const languageForm = {
    title: copy.languageTitle,
    fields: [
      {
        name: "locale",
        type: "select",
        label: copy.languageLabel,
        required: true,
        options: [
          {
            value: "en",
            label: "English",
          },
          {
            value: "ja",
            label: "日本語",
          },
          {
            value: "zh-hans",
            label: "简体中文",
          },
        ],
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton,
        },
        {
          id: "save-language",
          variant: "pr",
          label: copy.saveButton,
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const appearanceForm = {
    title: copy.appearanceTitle,
    fields: [
      {
        name: "theme",
        type: "select",
        label: copy.themeLabel,
        required: true,
        options: [
          {
            value: "dark",
            label: copy.darkThemeName,
          },
          {
            value: "light",
            label: copy.lightThemeName,
          },
        ],
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton,
        },
        {
          id: "save-appearance",
          variant: "pr",
          label: copy.saveButton,
          type: "submit",
          validate: true,
        },
      ],
    },
  };

  const localProjects = Array.isArray(state.projects) ? state.projects : [];
  const cloudProjects = Array.isArray(state.cloudProjects)
    ? state.cloudProjects
    : [];
  const hasLocalProjects = localProjects.length > 0;
  const hasCloudProjects = cloudProjects.length > 0;
  const showCloudLoginHint = !state.isLoggedIn;
  const isDesktopProjectLayout =
    !state.isTouchMode && state.platform !== "android";

  return {
    ...state,
    localTitle: copy.title,
    cloudTitle: copy.cloudTitle,
    loginButtonText: copy.loginButton,
    createButtonText: copy.createButton,
    createCloudButtonText: copy.createCloudButton,
    openButtonText: copy.importButton,
    profileDisplayName,
    avatarImageSrc,
    navbarContentWidth: isDesktopProjectLayout ? "640" : "f",
    showMobileProjectActions: Boolean(state.isTouchMode),
    showProjectAccountActions: Boolean(
      state.showCloudProjects && !state.isTouchMode,
    ),
    deleteDialogTitle: copy.removeProjectTitle,
    deleteDialogMessage: formatProjectsPageCopy(copy.removeProjectMessage, {
      projectName: deleteDialogProjectName,
    }),
    deleteDialogConfirmLabel: copy.removeButton,
    hasLocalProjects,
    localEmptyMessage: hasLocalProjects ? "" : copy.localEmptyTitle,
    localEmptySubMessage: hasLocalProjects ? "" : copy.localEmptyDescription,
    hasCloudProjects,
    showCloudLoginHint,
    cloudEmptyMessage: showCloudLoginHint
      ? copy.cloudLoginTitle
      : hasCloudProjects
        ? ""
        : copy.cloudEmptyTitle,
    cloudEmptySubMessage: showCloudLoginHint
      ? copy.cloudLoginDescription
      : hasCloudProjects
        ? ""
        : copy.cloudEmptyDescription,
    cloudCreateForm,
    addMemberForm,
    languageForm,
    appearanceForm,
    profileDialogForm,
    settingsDialogForm,
  };
};
