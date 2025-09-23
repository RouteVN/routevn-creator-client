export const INITIAL_STATE = Object.freeze({
  versions: [],
  showVersionForm: false,
  versionFormData: {},

  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetVersionId: null,
    items: [],
  },
});

export const openDropdownMenu = (state, { x, y, versionId }) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetVersionId = versionId;
  state.dropdownMenu.items = [
    { label: "Create Bundle", type: "item", value: "bundle" },
    { label: "Delete", type: "item", value: "delete" },
  ];
};

export const closeDropdownMenu = (state) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetVersionId = null;
  state.dropdownMenu.items = [];
};

export const selectDropdownMenuTargetVersionId = ({ state }) => {
  return state.dropdownMenu.targetVersionId;
};

export const selectVersions = ({ state }) => {
  return state.versions;
};

export const toViewData = ({ state, props }) => {
  const versionFormFields = {
    fields: [
      {
        name: "name",
        inputType: "inputText",
        description: "Version Name",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          content: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          content: "Save",
        },
      ],
    },
  };

  return {
    versions: state.versions || [],
    showVersionForm: state.showVersionForm || false,
    versionFormFields,
    resourceCategory: props.resourceCategory,
    selectedResourceId: props.selectedResourceId,
    flatItems: props.flatItems,
    repositoryTarget: props.repositoryTarget,
    dropdownMenu: state.dropdownMenu,
  };
};

export const setVersions = (state, versions) => {
  state.versions = versions;
};

export const setShowVersionForm = (state, show) => {
  state.showVersionForm = show;
};

export const setVersionFormData = (state, data) => {
  state.versionFormData = data;
};

export const resetVersionForm = (state) => {
  state.showVersionForm = false;
  state.versionFormData = {};
};

export const addVersion = (state, version) => {
  state.versions = [version, ...state.versions];
};

export const deleteVersion = (state, versionId) => {
  state.versions = state.versions.filter((v) => v.id !== versionId);
};
