import { formatDate } from "../../internal/dates.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  buildMobileResourcePageViewData,
  createMobileResourcePageState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { selectVersionsPageCopy } from "./support/versionsPageCopy.js";

// TODO: Show native export actions again when Windows and macOS releases are ready.
const NATIVE_EXPORTS_VISIBLE = false;

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

const createVersionForm = ({ isEditing, copy = {} } = {}) => ({
  title: isEditing
    ? (copy.editVersionTitle ?? "Edit Version")
    : (copy.createVersionTitle ?? "Create Version"),
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: isEditing
          ? (copy.updateVersionButton ?? "Update Version")
          : (copy.createVersionButton ?? "Create Version"),
      },
    ],
  },
});

const createDropdownMenuItems = (copy = {}) => [
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit" },
  { label: copy.deleteMenuItem ?? "Delete", type: "item", value: "delete" },
];

const formatConfirmationValue = (value, copy) => {
  const normalized = String(value ?? "").trim();
  return normalized || (copy.notSetLabel ?? "Not set");
};

const getExportConfirmationTitle = (exportType, copy) => {
  if (exportType === "windows-executable") {
    return (
      copy.confirmWindowsExecutableExportTitle ?? "Confirm Windows EXE Export"
    );
  }
  if (exportType === "windows-installer") {
    return (
      copy.confirmWindowsInstallerExportTitle ??
      "Confirm Windows Installer Export"
    );
  }
  if (exportType === "macos-application") {
    return copy.confirmMacosExportTitle ?? "Confirm macOS App Export";
  }
  return copy.confirmWebExportTitle ?? "Confirm Web Export";
};

const getExportConfirmationButtonLabel = (exportType, copy) => {
  if (exportType === "windows-executable") {
    return copy.exportWindowsExecutableButton ?? "Export Windows EXE";
  }
  if (exportType === "windows-installer") {
    return copy.exportWindowsInstallerButton ?? "Export Windows Installer";
  }
  if (exportType === "macos-application") {
    return copy.exportMacosApplicationButton ?? "Export macOS App";
  }
  return copy.exportWebButton ?? "Export Web";
};

const buildExportConfirmationFields = (
  confirmation,
  copy,
  platformDetailsCopy,
) => {
  const applicationInfo = confirmation.applicationInfo ?? {};
  const fields = [
    {
      type: "text",
      label: copy.releaseVersionLabel ?? "Release Version",
      value: formatConfirmationValue(confirmation.versionName, copy),
    },
    {
      type: "text",
      label: platformDetailsCopy.applicationNameLabel ?? "Application Name",
      value: formatConfirmationValue(applicationInfo.applicationName, copy),
    },
    {
      type: "slot",
      slot: "export-confirmation-icon",
      label: platformDetailsCopy.iconLabel ?? "Icon",
    },
  ];

  fields.push({
    type: "text",
    label:
      confirmation.platform === "macos"
        ? (platformDetailsCopy.macosApplicationIdentifierLabel ??
          "Bundle Identifier")
        : (platformDetailsCopy.applicationIdentifierLabel ??
          "Application Identifier"),
    value: formatConfirmationValue(applicationInfo.applicationIdentifier, copy),
  });

  if (
    confirmation.platform === "windows" ||
    confirmation.platform === "macos"
  ) {
    fields.push(
      {
        type: "text",
        label:
          confirmation.platform === "windows"
            ? (platformDetailsCopy.windowsPublisherLabel ??
              "Company / Publisher")
            : (platformDetailsCopy.macosPublisherLabel ??
              "Developer / Publisher"),
        value: formatConfirmationValue(applicationInfo.publisher, copy),
      },
      {
        type: "text",
        label: platformDetailsCopy.descriptionLabel ?? "Description",
        value: formatConfirmationValue(applicationInfo.description, copy),
      },
      {
        type: "text",
        label: platformDetailsCopy.copyrightLabel ?? "Copyright",
        value: formatConfirmationValue(applicationInfo.copyright, copy),
      },
    );
  }

  if (confirmation.platform === "macos") {
    fields.push({
      type: "text",
      label: platformDetailsCopy.categoryLabel ?? "Application Category",
      value: formatConfirmationValue(applicationInfo.category, copy),
    });
  }

  return fields;
};

export const createInitialState = () => ({
  isVersionsLoading: true,
  versions: [],
  selectedItemId: undefined,
  platform: "web",
  visualTestMode: false,
  windowsExportAvailability: {
    portableExecutable: false,
    installer: false,
    templateAvailable: false,
    installerHostSupported: false,
    installerToolAvailable: false,
  },
  macosExportAvailability: {
    application: false,
    templateAvailable: false,
    hostSupported: false,
  },
  ...createMobileResourcePageState(),
  isVersionDialogOpen: false,
  editingVersionId: undefined,
  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetVersionId: undefined,
    items: [],
  },
  exportConfirmation: {
    isOpen: false,
    exportType: undefined,
    platform: undefined,
    versionId: undefined,
    versionName: "",
    applicationInfo: undefined,
  },
});

export const openDropdownMenu = ({ state, i18n }, { x, y, versionId } = {}) => {
  const copy = selectVersionsPageCopy(i18n);
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetVersionId = versionId;
  state.dropdownMenu.items = createDropdownMenuItems(copy);
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

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  setMobileResourcePageUiConfigState(state, {
    uiConfig,
    clearSearchOnTouch: false,
  });
};

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform ?? "web";
};

export const setVisualTestMode = ({ state }, { enabled } = {}) => {
  state.visualTestMode = !!enabled;
};

export const setWindowsExportAvailability = (
  { state },
  { availability } = {},
) => {
  state.windowsExportAvailability.portableExecutable =
    !!availability?.portableExecutable;
  state.windowsExportAvailability.installer = !!availability?.installer;
  state.windowsExportAvailability.templateAvailable =
    !!availability?.templateAvailable;
  state.windowsExportAvailability.installerHostSupported =
    !!availability?.installerHostSupported;
  state.windowsExportAvailability.installerToolAvailable =
    !!availability?.installerToolAvailable;
};

export const setMacosExportAvailability = (
  { state },
  { availability } = {},
) => {
  state.macosExportAvailability.application = !!availability?.application;
  state.macosExportAvailability.templateAvailable =
    !!availability?.templateAvailable;
  state.macosExportAvailability.hostSupported = !!availability?.hostSupported;
};

export const openVersionDialog = ({ state }, { versionId } = {}) => {
  state.isVersionDialogOpen = true;
  state.editingVersionId = versionId;
};

export const closeVersionDialog = ({ state }, _payload = {}) => {
  state.isVersionDialogOpen = false;
  state.editingVersionId = undefined;
};

export const openExportConfirmation = (
  { state },
  { exportType, platform, versionId, versionName, applicationInfo } = {},
) => {
  state.exportConfirmation.isOpen = true;
  state.exportConfirmation.exportType = exportType;
  state.exportConfirmation.platform = platform;
  state.exportConfirmation.versionId = versionId;
  state.exportConfirmation.versionName = versionName ?? "";
  state.exportConfirmation.applicationInfo = applicationInfo;
};

export const closeExportConfirmation = ({ state }, _payload = {}) => {
  state.exportConfirmation.isOpen = false;
  state.exportConfirmation.exportType = undefined;
  state.exportConfirmation.platform = undefined;
  state.exportConfirmation.versionId = undefined;
  state.exportConfirmation.versionName = "";
  state.exportConfirmation.applicationInfo = undefined;
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

export const selectExportConfirmation = ({ state }) => {
  return {
    exportType: state.exportConfirmation.exportType,
    platform: state.exportConfirmation.platform,
    versionId: state.exportConfirmation.versionId,
    applicationInfo: state.exportConfirmation.applicationInfo,
  };
};

export const selectVersions = ({ state }) => {
  return state.versions;
};

export const selectVersion = ({ state }, versionId) => {
  return findVersionById(state.versions, versionId);
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectVersionsPageCopy(i18n);
  const platformDetailsCopy = i18n?.platformDetailsPage ?? {};
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
          label: copy.actionLabel ?? "Action",
          value:
            selectedVersion.actionIndex === undefined
              ? ""
              : String(selectedVersion.actionIndex),
        },
        {
          type: "text",
          label: copy.createdLabel ?? "Created",
          value: formatDate(selectedVersion.createdAt),
        },
        {
          type: "slot",
          slot: "actions",
          label: copy.actionsLabel ?? "Actions",
        },
      ]
    : [];

  const versions = (state.versions ?? []).map((version) => {
    const isSelected = version.id === state.selectedItemId;

    return {
      ...version,
      description: getVersionDescription(version),
      formattedCreatedAt: formatDate(version.createdAt),
      actionSummary: formatI18nCopy(
        copy.actionSummaryTemplate ?? "Action {actionIndex} • {createdAt}",
        {
          actionIndex: version.actionIndex,
          createdAt: formatDate(version.createdAt),
        },
      ),
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
    };
  });

  return {
    isVersionsLoading: state.isVersionsLoading,
    versions,
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedVersion?.name ?? "",
    detailFields,
    ...buildMobileResourcePageViewData({
      state,
      detailFields,
    }),
    isVersionDialogOpen: state.isVersionDialogOpen,
    versionForm: createVersionForm({ isEditing, copy }),
    dropdownMenu: state.dropdownMenu,
    isExportConfirmationOpen: state.exportConfirmation.isOpen,
    exportConfirmationTitle: getExportConfirmationTitle(
      state.exportConfirmation.exportType,
      copy,
    ),
    exportConfirmationMessage:
      copy.exportConfirmationMessage ??
      "Review the build information before exporting.",
    exportConfirmationFields: state.exportConfirmation.isOpen
      ? buildExportConfirmationFields(
          state.exportConfirmation,
          copy,
          platformDetailsCopy,
        )
      : [],
    exportConfirmationIconFileId:
      state.exportConfirmation.applicationInfo?.iconFileId,
    exportConfirmationConfirmLabel: getExportConfirmationButtonLabel(
      state.exportConfirmation.exportType,
      copy,
    ),
    exportConfirmationKey: `${state.exportConfirmation.exportType ?? "none"}-${state.exportConfirmation.versionId ?? "none"}`,
    title: copy.title ?? "Versions",
    createButton: copy.createButton ?? "New Version",
    loadingMessage: copy.loadingMessage ?? "Loading...",
    noVersionsMessage: copy.noVersionsMessage ?? "No versions",
    exportWebButton: copy.exportWebButton ?? "Export Web",
    exportWindowsExecutableButton:
      copy.exportWindowsExecutableButton ?? "Export Windows EXE",
    exportWindowsInstallerButton:
      copy.exportWindowsInstallerButton ?? "Export Windows Installer",
    exportMacosApplicationButton:
      copy.exportMacosApplicationButton ?? "Export macOS App",
    canExportWindowsExecutable:
      NATIVE_EXPORTS_VISIBLE && state.platform === "tauri",
    canExportWindowsInstaller:
      NATIVE_EXPORTS_VISIBLE &&
      state.platform === "tauri" &&
      state.windowsExportAvailability.installer,
    canExportMacosApplication:
      NATIVE_EXPORTS_VISIBLE &&
      ((state.platform === "tauri" &&
        state.macosExportAvailability.hostSupported) ||
        state.visualTestMode),
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    resourceCategory: "releases",
    resourceType: "versions",
    selectedResourceId: "versions",
  };
};

export const setVersions = ({ state }, { versions } = {}) => {
  state.versions = Array.isArray(versions) ? versions : [];
  state.isVersionsLoading = false;

  if (!findVersionById(state.versions, state.selectedItemId)) {
    state.selectedItemId = undefined;
  }

  if (!findVersionById(state.versions, state.editingVersionId)) {
    state.editingVersionId = undefined;
  }
};

export const setVersionsLoading = ({ state }, { loading } = {}) => {
  state.isVersionsLoading = loading;
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
