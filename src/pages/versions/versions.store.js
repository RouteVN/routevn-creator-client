import { formatDate } from "../../internal/dates.js";

const findVersionById = (versions, versionId) => {
  if (!versionId) {
    return undefined;
  }

  return (Array.isArray(versions) ? versions : []).find(
    (version) => version.id === versionId,
  );
};

const getVersionDescription = (version) => {
  return version?.description ?? version?.notes ?? "";
};

const createVersionForm = ({ isEditing } = {}) => ({
  title: isEditing ? "Edit Version" : "Create Version",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: isEditing ? "Update Version" : "Create Version",
      },
    ],
  },
});

export const createInitialState = () => ({
  versions: [],
  selectedItemId: undefined,
  isVersionDialogOpen: false,
  editingVersionId: undefined,
  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetVersionId: undefined,
    items: [],
  },
});

export const openDropdownMenu = ({ state }, { x, y, versionId } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetVersionId = versionId;
  state.dropdownMenu.items = [
    { label: "Edit", type: "item", value: "edit" },
    { label: "Delete", type: "item", value: "delete" },
  ];
};

export const closeDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetVersionId = undefined;
  state.dropdownMenu.items = [];
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const openVersionDialog = ({ state }, { versionId } = {}) => {
  state.isVersionDialogOpen = true;
  state.editingVersionId = versionId;
};

export const closeVersionDialog = ({ state }, _payload = {}) => {
  state.isVersionDialogOpen = false;
  state.editingVersionId = undefined;
};

export const selectDropdownMenuTargetVersionId = ({ state }) => {
  return state.dropdownMenu.targetVersionId;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectEditingVersionId = ({ state }) => {
  return state.editingVersionId;
};

export const selectVersions = ({ state }) => {
  return state.versions;
};

export const selectVersion = ({ state }, versionId) => {
  return findVersionById(state.versions, versionId);
};

export const selectViewData = ({ state }) => {
  const selectedVersion = findVersionById(state.versions, state.selectedItemId);
  const isEditing = !!state.editingVersionId;
  const detailDescription = getVersionDescription(selectedVersion);

  const detailFields = selectedVersion
    ? [
        ...(detailDescription
          ? [
              {
                type: "description",
                value: detailDescription,
              },
            ]
          : []),
        {
          type: "text",
          label: "Action",
          value:
            selectedVersion.actionIndex === undefined
              ? ""
              : String(selectedVersion.actionIndex),
        },
        {
          type: "text",
          label: "Created",
          value: formatDate(selectedVersion.createdAt),
        },
        {
          type: "slot",
          slot: "actions",
          label: "Actions",
        },
      ]
    : [];

  const versions = (state.versions ?? []).map((version) => {
    const isSelected = version.id === state.selectedItemId;

    return {
      ...version,
      description: getVersionDescription(version),
      formattedCreatedAt: formatDate(version.createdAt),
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
    };
  });

  return {
    versions,
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedVersion?.name ?? "",
    detailFields,
    isVersionDialogOpen: state.isVersionDialogOpen,
    versionForm: createVersionForm({ isEditing }),
    dropdownMenu: state.dropdownMenu,
    resourceCategory: "releases",
    resourceType: "versions",
    selectedResourceId: "versions",
  };
};

export const setVersions = ({ state }, { versions } = {}) => {
  state.versions = Array.isArray(versions) ? versions : [];

  if (!findVersionById(state.versions, state.selectedItemId)) {
    state.selectedItemId = undefined;
  }

  if (!findVersionById(state.versions, state.editingVersionId)) {
    state.editingVersionId = undefined;
  }
};

export const addVersion = ({ state }, { version } = {}) => {
  state.versions = [version, ...state.versions];
};

export const updateVersion = ({ state }, { version } = {}) => {
  if (!version?.id) {
    return;
  }

  state.versions = state.versions.map((currentVersion) =>
    currentVersion.id === version.id ? version : currentVersion,
  );
};

export const deleteVersion = ({ state }, { versionId } = {}) => {
  state.versions = state.versions.filter((version) => version.id !== versionId);

  if (state.selectedItemId === versionId) {
    state.selectedItemId = undefined;
  }

  if (state.editingVersionId === versionId) {
    state.editingVersionId = undefined;
  }
};
