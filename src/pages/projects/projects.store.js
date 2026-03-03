export const createInitialState = () => ({
  title: "Local Projects",
  loginButtonText: "Login",
  createButtonText: "Create Project",
  openButtonText: "Open Project",
  isLoggedIn: false,
  userEmail: "",
  userName: "",
  userDisplayColor: "#E2E8F0",
  userAvatar: "",
  avatarInitial: "U",
  projects: [],
  isOpen: false,
  platform: "tauri",
  projectPath: "",
  projectPathDisplay: "No folder selected",

  profileMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
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
    targetProjectId: null,
    items: [],
  },

  deleteDialog: {
    isOpen: false,
    projectId: null,
    projectName: "",
  },

  defaultValues: {
    name: "",
    description: "",
    projectPath: "",
    template: "default",
  },

  form: {
    title: "Create Project",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Project Name",
        required: true,
        testId: "project-name-input",
        validations: [
          {
            rule: /^.+$/,
            message: "Name is required",
          },
        ],
      },
      {
        name: "description",
        type: "input-text",
        label: "Description",
        description: "Enter a brief description of the project",
        required: true,
        testId: "project-description-input",
        validations: [
          {
            rule: /^.+$/,
            message: "Description is required",
          },
        ],
      },
      // comment since we only have 1 template
      // {
      //   name: "template",
      //   type: "select",
      //   label: "Template",
      //   required: true,
      //   options: [{ value: "default", label: "Default" }],
      // },
      {
        $when: "platform == 'tauri'",
        name: "projectPath",
        type: "slot",
        slot: "project-path-selector",
        label: "Project Location",
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: "Project location is required",
          },
        ],
      },
    ],
    actions: {
      layout: "", // vertical, fill, right, left
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Submit",
          type: "submit",
          testId: "create-project-submit-button",
        },
      ],
    },
  },
});

export const toggleDialog = ({ state }, _payload = {}) => {
  state.isOpen = !state.isOpen;
  // Reset form when closing
  if (!state.isOpen) {
    state.defaultValues.name = "";
    state.defaultValues.description = "";
    state.defaultValues.projectPath = "";
    state.defaultValues.template = "default";
    state.projectPath = "";
    state.projectPathDisplay = "No folder selected";
  }
};

export const closeDialog = ({ state }, _payload = {}) => {
  state.isOpen = false;
  state.defaultValues.name = "";
  state.defaultValues.description = "";
  state.defaultValues.projectPath = "";
  state.defaultValues.template = "default";
  state.projectPath = "";
  state.projectPathDisplay = "No folder selected";
};

export const selectIsCreateDialogOpen = ({ state }) => {
  return Boolean(state.isOpen);
};

export const setProjects = ({ state }, { projects } = {}) => {
  state.projects = projects;
};

export const addProject = ({ state }, { project } = {}) => {
  state.projects.push(project);
};

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform;
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

export const removeProject = ({ state }, { projectId } = {}) => {
  state.projects = state.projects.filter((p) => p.id !== projectId);
};

export const openProfileMenu = ({ state }, { x, y } = {}) => {
  state.profileMenu.isOpen = true;
  state.profileMenu.x = x;
  state.profileMenu.y = y;
  state.profileMenu.items = [
    { label: "Edit profile", type: "item", value: "edit-profile" },
    { label: "Settings", type: "item", value: "settings" },
    { label: "Logout", type: "item", value: "logout" },
  ];
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

export const setProjectPath = ({ state }, { path } = {}) => {
  state.projectPath = path; // Update top-level for binding
  state.defaultValues.projectPath = path; // Update defaultValues for form
  state.projectPathDisplay = path || "No folder selected";
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const selectProjectPath = ({ state }) => {
  return state.defaultValues.projectPath;
};

export const selectProjects = ({ state }) => {
  return state.projects;
};

export const selectDropdownMenuTargetProjectId = ({ state }) => {
  return state.dropdownMenu.targetProjectId;
};

export const selectIsProjectDropdownMenuOpen = ({ state }) => {
  return Boolean(state.dropdownMenu?.isOpen);
};

export const openDropdownMenu = ({ state }, { x, y, projectId } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetProjectId = projectId;
  state.dropdownMenu.items = [
    { label: "Delete", type: "item", value: "delete" },
  ];
};

export const closeDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetProjectId = null;
  state.dropdownMenu.items = [];
};

export const openDeleteDialog = (
  { state },
  { projectId, projectName = "" } = {},
) => {
  state.deleteDialog.isOpen = true;
  state.deleteDialog.projectId = projectId || null;
  state.deleteDialog.projectName = projectName;
};

export const closeDeleteDialog = ({ state }, _payload = {}) => {
  state.deleteDialog.isOpen = false;
  state.deleteDialog.projectId = null;
  state.deleteDialog.projectName = "";
};

export const selectDeleteDialogProjectId = ({ state }) => {
  return state.deleteDialog.projectId;
};

export const selectIsDeleteDialogOpen = ({ state }) => {
  return Boolean(state.deleteDialog?.isOpen);
};

export const selectViewData = ({ state }) => {
  const deleteDialogProjectName = state.deleteDialog.projectName
    ? `"${state.deleteDialog.projectName}"`
    : "this project";
  const profileDisplayName = state.userName || state.userEmail || "User";
  const avatarImageSrc =
    state.userAvatar || "/public/project_logo_placeholder.png";
  const profileDialogForm = {
    title: "Edit Profile",
    fields: [
      {
        name: "displayName",
        type: "input-text",
        label: "Display Name",
      },
      {
        name: "displayColor",
        type: "color-picker",
        label: "Display Color",
      },
      {
        name: "avatar",
        type: "input-text",
        label: "Avatar",
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "save",
          variant: "pr",
          label: "Save",
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const settingsDialogForm = {
    title: "Settings",
    fields: [
      {
        name: "email",
        type: "input-text",
        label: "Email",
        required: true,
        validations: [
          {
            rule: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: "Please enter a valid email address",
          },
        ],
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "save",
          variant: "pr",
          label: "Save",
          type: "submit",
          validate: true,
        },
      ],
    },
  };

  return {
    ...state,
    profileDisplayName,
    avatarImageSrc,
    context: {
      platform: state.platform,
    },
    deleteDialogTitle: "Delete Project",
    deleteDialogMessage: `Are you sure you want to delete ${deleteDialogProjectName}? This action cannot be undone.`,
    hasProjects: state.projects && state.projects.length > 0,
    emptyMessage:
      state.projects && state.projects.length === 0 ? "No projects yet" : "",
    emptySubMessage:
      state.projects && state.projects.length === 0
        ? "Create or open a project to get started"
        : "",
    profileDialogForm,
    settingsDialogForm,
  };
};
