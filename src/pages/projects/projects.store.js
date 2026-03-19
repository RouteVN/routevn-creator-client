export const createInitialState = () => ({
  localTitle: "Projects",
  cloudTitle: "Cloud Projects",
  showCloudProjects: false,
  loginButtonText: "Login",
  createButtonText: "Create",
  createCloudButtonText: "Create Cloud Project",
  openButtonText: "Open",
  isLoggedIn: false,
  userEmail: "",
  userName: "",
  userDisplayColor: "#E2E8F0",
  userAvatar: "",
  avatarInitial: "U",
  projects: [],
  cloudProjects: [],
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
    targetScope: "local",
    targetProjectId: null,
    items: [],
  },

  deleteDialog: {
    isOpen: false,
    projectId: null,
    projectName: "",
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

export const setCloudProjects = ({ state }, { projects } = {}) => {
  state.cloudProjects = Array.isArray(projects) ? projects : [];
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

export const selectDropdownMenuTargetScope = ({ state }) => {
  return state.dropdownMenu.targetScope || "local";
};

export const selectIsProjectDropdownMenuOpen = ({ state }) => {
  return Boolean(state.dropdownMenu?.isOpen);
};

export const openDropdownMenu = (
  { state },
  { x, y, scope = "local", projectId, items } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetScope = scope;
  state.dropdownMenu.targetProjectId = projectId;
  state.dropdownMenu.items = Array.isArray(items)
    ? items
    : [{ label: "Remove", type: "item", value: "delete" }];
};

export const closeDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetScope = "local";
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
  const cloudCreateForm = {
    title: "Create Cloud Project",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Project Name",
        required: true,
        validations: [
          {
            rule: /^.+$/,
            message: "Project name is required",
          },
        ],
      },
      {
        name: "description",
        type: "input-text",
        label: "Description",
        description: "Optional",
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
          id: "create-cloud",
          variant: "pr",
          label: "Create Project",
          type: "submit",
          validate: true,
        },
      ],
    },
  };
  const addMemberDialogTitle = state.addMemberDialog.projectName
    ? `Add Member - ${state.addMemberDialog.projectName}`
    : "Add Member";
  const addMemberForm = {
    title: addMemberDialogTitle,
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
          id: "submit-add-member",
          variant: "pr",
          label: "Submit",
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

  return {
    ...state,
    profileDisplayName,
    avatarImageSrc,
    context: {
      platform: state.platform,
    },
    deleteDialogTitle: "Remove Project",
    deleteDialogMessage: `Are you sure you want to remove ${deleteDialogProjectName} from the list? The project folder will still remain on disk. Delete the folder yourself if you want to permanently remove the project files.`,
    deleteDialogConfirmLabel: "Remove",
    hasLocalProjects,
    localEmptyMessage: hasLocalProjects ? "" : "No local projects yet",
    localEmptySubMessage: hasLocalProjects
      ? ""
      : "Create or open a local project to get started",
    hasCloudProjects,
    showCloudLoginHint,
    cloudEmptyMessage: showCloudLoginHint
      ? "Login to see your cloud projects"
      : hasCloudProjects
        ? ""
        : "No cloud projects yet",
    cloudEmptySubMessage: showCloudLoginHint
      ? "Authenticate to load projects from your RouteVN account."
      : hasCloudProjects
        ? ""
        : "Create your first cloud project.",
    cloudCreateForm,
    addMemberForm,
    profileDialogForm,
    settingsDialogForm,
  };
};
