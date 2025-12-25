export const createInitialState = () => ({
  title: "Projects",
  createButtonText: "Create Project",
  openButtonText: "Open Project",
  projects: [],
  isOpen: false,
  platform: "tauri",
  projectPath: "",
  projectPathDisplay: "No folder selected",

  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetProjectId: null,
    items: [],
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
        inputType: "inputText",
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
        inputType: "inputText",
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
      //   inputType: "select",
      //   label: "Template",
      //   required: true,
      //   options: [{ value: "default", label: "Default" }],
      // },
      {
        $when: "platform == 'tauri'",
        name: "projectPath",
        inputType: "slot",
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
          content: "Submit",
          type: "submit",
          testId: "create-project-submit-button",
        },
      ],
    },
  },
});

export const toggleDialog = (state) => {
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

export const setProjects = (state, projects) => {
  state.projects = projects;
};

export const addProject = (state, project) => {
  state.projects.push(project);
};

export const setPlatform = (state, platform) => {
  state.platform = platform;
};

export const removeProject = (state, projectId) => {
  state.projects = state.projects.filter((p) => p.id !== projectId);
};

export const setProjectPath = (state, path) => {
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

export const openDropdownMenu = (state, { x, y, projectId }) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetProjectId = projectId;
  state.dropdownMenu.items = [
    { label: "Delete", type: "item", value: "delete" },
  ];
};

export const closeDropdownMenu = (state) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetProjectId = null;
  state.dropdownMenu.items = [];
};

export const selectViewData = ({ state }) => {
  return {
    ...state,
    context: {
      platform: state.platform,
    },
    hasProjects: state.projects && state.projects.length > 0,
    emptyMessage:
      state.projects && state.projects.length === 0 ? "No projects yet" : "",
    emptySubMessage:
      state.projects && state.projects.length === 0
        ? "Create or open a project to get started"
        : "",
  };
};
