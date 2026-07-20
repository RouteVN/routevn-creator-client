import { selectPlatformDetailsPageCopy } from "./support/platformDetailsPageCopy.js";

const PLATFORM_IDS = ["web", "windows", "macos"];
// TODO: Add Windows and macOS back when native platform releases are ready.
const VISIBLE_PLATFORM_IDS = ["web"];

const createPlatformApplicationInfo = (platform) => {
  const applicationInfo = {
    applicationName: "",
    applicationIdentifier: "",
  };

  // TODO: Add a Web-specific icon back when Web export no longer uses the
  // Project Info icon.
  if (platform !== "web") {
    applicationInfo.iconFileId = undefined;
  }

  if (platform === "windows") {
    applicationInfo.publisher = "";
    applicationInfo.description = "";
    applicationInfo.copyright = "";
  }

  if (platform === "macos") {
    applicationInfo.publisher = "";
    applicationInfo.description = "";
    applicationInfo.copyright = "";
    applicationInfo.category = "";
  }

  return applicationInfo;
};

const createPlatformEditDefaultValues = () => ({
  applicationName: "",
  applicationIdentifier: "",
  description: "",
  publisher: "",
  copyright: "",
  category: "",
});

const getPlatformTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.windowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.macosPlatformDetailsTitle;
  }
  return copy.webPlatformDetailsTitle;
};

const getPlatformEditTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.editWindowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.editMacosPlatformDetailsTitle;
  }
  return copy.editWebPlatformDetailsTitle;
};

const getPlatformCreateTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.createWindowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.createMacosPlatformDetailsTitle;
  }
  return copy.createWebPlatformDetailsTitle;
};

const getPlatformTabLabel = (platform, copy) => {
  if (platform === "windows") {
    return copy.windowsTabLabel;
  }
  if (platform === "macos") {
    return copy.macosTabLabel;
  }
  return copy.webTabLabel;
};

const buildPlatformDetailFields = (platform, applicationInfo, copy) => {
  const fields = [
    {
      type: "slot",
      slot: "platform-application-name",
      label: copy.applicationNameLabel,
    },
  ];

  if (platform !== "web") {
    fields.push({
      type: "slot",
      slot: "platform-application-icon",
      label: copy.iconLabel,
    });
  }

  fields.push({
    type: "slot",
    slot: "platform-application-identifier",
    label:
      platform === "macos"
        ? copy.macosApplicationIdentifierLabel
        : copy.applicationIdentifierLabel,
  });

  if (platform === "windows" || platform === "macos") {
    fields.push(
      {
        type: "text",
        label:
          platform === "windows"
            ? copy.windowsPublisherLabel
            : copy.macosPublisherLabel,
        value: applicationInfo.publisher,
      },
      {
        type: "text",
        label: copy.descriptionLabel,
        value: applicationInfo.description,
      },
      {
        type: "text",
        label: copy.copyrightLabel,
        value: applicationInfo.copyright,
      },
    );
  }

  if (platform === "macos") {
    fields.push({
      type: "text",
      label: copy.categoryLabel,
      value: applicationInfo.category,
    });
  }

  return fields;
};

const createPlatformEditForm = (platform, mode, copy) => {
  const fields = [
    {
      name: "applicationName",
      type: "input-text",
      label: copy.applicationNameLabel,
      description: copy[`${platform}ApplicationNameDescription`],
      required: true,
    },
  ];

  if (platform !== "web") {
    fields.push({
      type: "slot",
      slot: "platform-application-icon-edit",
      label: copy.iconLabel,
      description: copy[`${platform}IconDescription`],
    });
  }

  fields.push({
    name: "applicationIdentifier",
    type: "input-text",
    label:
      platform === "macos"
        ? copy.macosApplicationIdentifierLabel
        : copy.applicationIdentifierLabel,
    description: copy[`${platform}ApplicationIdentifierDescription`],
    required: platform !== "windows",
  });

  if (platform === "windows" || platform === "macos") {
    fields.push(
      {
        name: "publisher",
        type: "input-text",
        label:
          platform === "windows"
            ? copy.windowsPublisherLabel
            : copy.macosPublisherLabel,
        description: copy[`${platform}PublisherDescription`],
        required: false,
      },
      {
        name: "description",
        type: "input-textarea",
        label: copy.descriptionLabel,
        description: copy[`${platform}DescriptionDescription`],
        required: false,
      },
      {
        name: "copyright",
        type: "input-text",
        label: copy.copyrightLabel,
        description: copy[`${platform}CopyrightDescription`],
        required: false,
      },
    );
  }

  if (platform === "macos") {
    fields.push({
      name: "category",
      type: "input-text",
      label: copy.categoryLabel,
      description: copy.macosCategoryDescription,
      required: false,
    });
  }

  return {
    title:
      mode === "create"
        ? getPlatformCreateTitle(platform, copy)
        : getPlatformEditTitle(platform, copy),
    fields,
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label:
            mode === "create"
              ? copy.createPlatformButtonLabel
              : copy.saveChangesButton,
        },
      ],
    },
  };
};

export const createInitialState = () => ({
  platformApplicationInfo: {},
  selectedPlatform: undefined,
  isTouchMode: false,
  addPlatformMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  },
  isPlatformEditDialogOpen: false,
  platformDialogMode: undefined,
  platformDialogPlatform: undefined,
  isPlatformEditIconCropDialogOpen: false,
  platformEditDefaultValues: createPlatformEditDefaultValues(),
  platformEditIconFileId: undefined,
  platformEditIconCropFile: undefined,
});

export const selectSelectedPlatform = ({ state }) => {
  return state.selectedPlatform;
};

export const selectPlatformEditDefaultValues = ({ state }) => {
  return state.platformEditDefaultValues;
};

export const selectPlatformEditIconFileId = ({ state }) => {
  return state.platformEditIconFileId;
};

export const selectPlatformDialogState = ({ state }) => {
  return {
    mode: state.platformDialogMode,
    platform: state.platformDialogPlatform,
  };
};

export const selectIsPlatformEditIconCropDialogOpen = ({ state }) => {
  return state.isPlatformEditIconCropDialogOpen;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectPlatformDetailsPageCopy(i18n);
  const createdPlatforms = VISIBLE_PLATFORM_IDS.filter(
    (platform) => state.platformApplicationInfo[platform],
  );
  const selectedPlatformInfo = state.selectedPlatform
    ? state.platformApplicationInfo[state.selectedPlatform]
    : undefined;
  const formPlatform = state.platformDialogPlatform ?? state.selectedPlatform;
  const formMode = state.platformDialogMode ?? "edit";

  return {
    addPlatformButtonLabel: copy.addPlatformButtonLabel,
    addPlatformMenu: state.addPlatformMenu,
    canAddPlatform: createdPlatforms.length < VISIBLE_PLATFORM_IDS.length,
    clickToUploadLabel: copy.clickToUpload,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
    detailFillHeight: false,
    emptyPlatformsMessage: copy.emptyPlatformsMessage,
    hasPlatformDetails: Boolean(selectedPlatformInfo),
    platformTabs: createdPlatforms.map((platform) => ({
      id: platform,
      label: getPlatformTabLabel(platform, copy),
    })),
    selectedPlatform: state.selectedPlatform,
    selectedPlatformTitle: selectedPlatformInfo
      ? getPlatformTitle(state.selectedPlatform, copy)
      : "",
    platformDetailFields: selectedPlatformInfo
      ? buildPlatformDetailFields(
          state.selectedPlatform,
          selectedPlatformInfo,
          copy,
        )
      : [],
    platformApplicationIconFileId: selectedPlatformInfo?.iconFileId,
    platformApplicationIdentifier:
      selectedPlatformInfo?.applicationIdentifier ?? "",
    platformApplicationName: selectedPlatformInfo?.applicationName ?? "",
    platformEditButtonLabel: copy.editPlatformDetailsButtonLabel,
    platformEditDefaultValues: state.platformEditDefaultValues,
    platformEditForm: formPlatform
      ? createPlatformEditForm(formPlatform, formMode, copy)
      : undefined,
    platformDialogKey: `${formMode}-${formPlatform ?? "none"}`,
    platformEditIconFileId: state.platformEditIconFileId,
    platformEditIconCropFile: state.platformEditIconCropFile,
    isPlatformEditDialogOpen: state.isPlatformEditDialogOpen,
    isPlatformEditIconCropDialogOpen: state.isPlatformEditIconCropDialogOpen,
    showPlatformApplicationIcon: state.selectedPlatform !== "web",
    showPlatformEditIcon: formPlatform !== "web",
    resourceCategory: "releases",
    selectedResourceId: "platformDetails",
    showExplorerPanel: !state.isTouchMode,
    title: copy.title,
  };
};

export const setPlatformApplicationInfo = (
  { state },
  { platform, applicationInfo } = {},
) => {
  if (!PLATFORM_IDS.includes(platform)) {
    return;
  }

  if (!applicationInfo) {
    return;
  }

  const target = createPlatformApplicationInfo(platform);
  state.platformApplicationInfo[platform] = target;
  target.applicationName = applicationInfo?.applicationName ?? "";
  target.applicationIdentifier = applicationInfo?.applicationIdentifier ?? "";
  if (platform !== "web") {
    target.iconFileId = applicationInfo?.iconFileId ?? undefined;
  }

  if (platform === "windows" || platform === "macos") {
    target.publisher = applicationInfo?.publisher ?? "";
    target.description = applicationInfo?.description ?? "";
    target.copyright = applicationInfo?.copyright ?? "";
  }

  if (platform === "macos") {
    target.category = applicationInfo?.category ?? "";
  }

  if (!state.selectedPlatform && VISIBLE_PLATFORM_IDS.includes(platform)) {
    state.selectedPlatform = platform;
  }
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setSelectedPlatform = ({ state }, { platform } = {}) => {
  if (
    VISIBLE_PLATFORM_IDS.includes(platform) &&
    state.platformApplicationInfo[platform]
  ) {
    state.selectedPlatform = platform;
  }
};

export const openAddPlatformMenu = ({ state, i18n }, { x, y } = {}) => {
  const copy = selectPlatformDetailsPageCopy(i18n);
  state.addPlatformMenu.isOpen = true;
  state.addPlatformMenu.x = x ?? 0;
  state.addPlatformMenu.y = y ?? 0;
  state.addPlatformMenu.items = VISIBLE_PLATFORM_IDS.filter(
    (platform) => !state.platformApplicationInfo[platform],
  ).map((platform) => ({
    label: getPlatformTabLabel(platform, copy),
    type: "item",
    value: platform,
  }));
};

export const closeAddPlatformMenu = ({ state }, _payload = {}) => {
  state.addPlatformMenu.isOpen = false;
  state.addPlatformMenu.x = 0;
  state.addPlatformMenu.y = 0;
  state.addPlatformMenu.items = [];
};

const setPlatformDialogDefaults = (state, platform, applicationInfo) => {
  state.platformEditDefaultValues.applicationName =
    applicationInfo.applicationName;
  state.platformEditDefaultValues.applicationIdentifier =
    applicationInfo.applicationIdentifier ?? "";
  state.platformEditDefaultValues.description =
    applicationInfo.description ?? "";
  state.platformEditDefaultValues.publisher = applicationInfo.publisher ?? "";
  state.platformEditDefaultValues.copyright = applicationInfo.copyright ?? "";
  state.platformEditDefaultValues.category = applicationInfo.category ?? "";
  state.platformEditIconFileId =
    platform === "web" ? undefined : applicationInfo.iconFileId;
};

export const openPlatformCreateDialog = (
  { state },
  { platform, applicationInfo } = {},
) => {
  if (!PLATFORM_IDS.includes(platform) || !applicationInfo) {
    return;
  }

  state.isPlatformEditDialogOpen = true;
  state.platformDialogMode = "create";
  state.platformDialogPlatform = platform;
  setPlatformDialogDefaults(state, platform, applicationInfo);
};

export const openPlatformEditDialog = ({ state }, _payload = {}) => {
  const applicationInfo = state.platformApplicationInfo[state.selectedPlatform];
  state.isPlatformEditDialogOpen = true;
  state.platformDialogMode = "edit";
  state.platformDialogPlatform = state.selectedPlatform;
  setPlatformDialogDefaults(state, state.selectedPlatform, applicationInfo);
};

export const closePlatformEditDialog = ({ state }, _payload = {}) => {
  state.isPlatformEditDialogOpen = false;
  state.isPlatformEditIconCropDialogOpen = false;
  state.platformDialogMode = undefined;
  state.platformDialogPlatform = undefined;
  state.platformEditIconFileId = undefined;
  state.platformEditIconCropFile = undefined;
};

export const setPlatformEditIconFileId = ({ state }, { iconFileId } = {}) => {
  state.platformEditIconFileId = iconFileId;
};

export const openPlatformEditIconCropDialog = ({ state }, { file } = {}) => {
  state.isPlatformEditIconCropDialogOpen = true;
  state.platformEditIconCropFile = file;
};

export const closePlatformEditIconCropDialog = ({ state }, _payload = {}) => {
  state.isPlatformEditIconCropDialogOpen = false;
  state.platformEditIconCropFile = undefined;
};
