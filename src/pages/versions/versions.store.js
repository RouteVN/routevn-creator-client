export const INITIAL_STATE = Object.freeze({
  versions: [],
  showVersionForm: false,
  versionFormData: {},
});

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
