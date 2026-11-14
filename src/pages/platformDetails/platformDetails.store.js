import {
  ANDROID_EXPORT_RELEASED,
  formatAndroidCertificateFingerprint,
} from "../../internal/androidExport.js";
import { formatDate } from "../../internal/dates.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  createPlatformEditForm,
  PLATFORM_APPLICATION_ICON_OUTPUT_SIZE,
} from "../../internal/ui/platformDetailsForm.js";
import {
  buildTabletLandscapeContentColumnStyle,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { selectPlatformDetailsPageCopy } from "./support/platformDetailsPageCopy.js";

// Android stays out of the tabs and the Add menu until its export ships.
const PLATFORM_IDS = ANDROID_EXPORT_RELEASED
  ? ["web", "windows", "macos", "android"]
  : ["web", "windows", "macos"];
const MOBILE_PLATFORM_IDS = ANDROID_EXPORT_RELEASED
  ? ["web", "android"]
  : ["web"];

const getAvailablePlatformIds = (state) =>
  state.platform === "android" || state.platform === "ios"
    ? MOBILE_PLATFORM_IDS
    : PLATFORM_IDS;

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

  // TODO: Restore optional Windows release metadata when these fields return
  // to the Platform Details UI.
  // if (platform === "windows") {
  //   applicationInfo.publisher = "";
  //   applicationInfo.description = "";
  //   applicationInfo.copyright = "";
  // }

  return applicationInfo;
};

const createPlatformEditDefaultValues = () => ({
  applicationName: "",
  applicationIdentifier: "",
  // TODO: Restore with the optional Windows release metadata fields.
  // description: "",
  // publisher: "",
  // copyright: "",
});

const getPlatformTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.windowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.macosPlatformDetailsTitle;
  }
  if (platform === "android") return copy.androidPlatformDetailsTitle;
  return copy.webPlatformDetailsTitle;
};

const getPlatformTabLabel = (platform, copy) => {
  if (platform === "windows") {
    return copy.windowsTabLabel;
  }
  if (platform === "macos") {
    return copy.macosTabLabel;
  }
  if (platform === "android") return copy.androidTabLabel;
  return copy.webTabLabel;
};

const buildPlatformDetailFields = (
  platform,
  _applicationInfo,
  copy,
  androidSigning,
) => {
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

  if (platform === "android") {
    fields.push(
      {
        type: "slot",
        slot: "android-adaptive-icon",
        label: copy.androidAdaptiveIconLabel,
      },
      {
        type: "slot",
        slot: "android-splash-icon",
        label: copy.androidSplashIconLabel,
      },
    );
  }

  fields.push({
    type: "slot",
    slot: "platform-application-identifier",
    label:
      platform === "macos"
        ? copy.macosApplicationIdentifierLabel
        : copy.applicationIdentifierLabel,
  });

  if (platform === "web") {
    fields.push(
      {
        type: "slot",
        slot: "web-loading-background",
        label: copy.webLoadingBackgroundLabel,
      },
      {
        type: "slot",
        slot: "web-start-background",
        label: copy.webStartBackgroundLabel,
      },
    );
  }

  // TODO: Restore optional Windows release metadata in the read-only details.
  // if (platform === "windows") {
  //   fields.push(
  //     {
  //       type: "text",
  //       label: copy.windowsPublisherLabel,
  //       value: _applicationInfo.publisher,
  //     },
  //     {
  //       type: "text",
  //       label: copy.descriptionLabel,
  //       value: _applicationInfo.description,
  //     },
  //     {
  //       type: "text",
  //       label: copy.copyrightLabel,
  //       value: _applicationInfo.copyright,
  //     },
  //   );
  // }

  if (platform === "android") {
    fields.push(
      {
        type: "text",
        label: copy.androidIconBackgroundColorLabel,
        value: _applicationInfo.iconBackgroundColor,
      },
      {
        type: "text",
        label: copy.androidSplashBackgroundColorLabel,
        value: _applicationInfo.splashBackgroundColor,
      },
      {
        type: "slot",
        slot: "android-previews",
        label: copy.androidPreviewLabel,
      },
    );
    if (androidSigning.supported) {
      fields.push({
        type: "slot",
        slot: "android-signing-key",
        label: copy.androidSigningKeyLabel,
      });
      if (androidSigning.previousKeys.length > 0) {
        fields.push({
          type: "slot",
          slot: "android-previous-signing-keys",
          label: copy.androidPreviousSigningKeysLabel,
        });
      }
    }
  }
  return fields;
};

// A key as the Signing Key section shows it.
const describeAndroidSigningKey = (key, copy, dateTime) => ({
  certificateSha256: key.certificateSha256,
  fingerprint: formatI18nCopy(copy.androidSigningKeyFingerprint, {
    fingerprint: formatAndroidCertificateFingerprint(key.certificateSha256),
  }),
  detail: formatI18nCopy(
    key.origin === "uploaded"
      ? copy.androidSigningKeyUploadedDetail
      : copy.androidSigningKeyCreatedDetail,
    { date: formatDate(new Date(key.addedAt).toISOString(), dateTime) },
  ),
});

export const createInitialState = () => ({
  platform: "web",
  iconPreviewColor: "#FFFFFF",
  splashPreviewColor: "#000000",
  platformApplicationInfo: {},
  selectedPlatform: undefined,
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
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
  platformEditAdaptiveIconFileId: undefined,
  platformEditSplashIconFileId: undefined,
  platformEditLoadingBackgroundFileId: undefined,
  platformEditStartBackgroundFileId: undefined,
  platformEditIconCropTarget: "icon",
  platformEditIconCropFile: undefined,
  // The project's Android signing keys, without key material. `busy` while a
  // key change runs.
  androidSigning: {
    supported: false,
    currentKey: undefined,
    previousKeys: [],
    busy: false,
  },
});

export const setAndroidSigning = (
  { state },
  { supported, currentKey, previousKeys } = {},
) => {
  state.androidSigning.supported = !!supported;
  state.androidSigning.currentKey = currentKey;
  state.androidSigning.previousKeys = previousKeys ?? [];
};

export const setAndroidSigningBusy = ({ state }, { busy } = {}) => {
  state.androidSigning.busy = !!busy;
};

export const selectAndroidSigning = ({ state }) => ({
  supported: state.androidSigning.supported,
  currentKey: state.androidSigning.currentKey,
  busy: state.androidSigning.busy,
});

export const selectAndroidApplicationInfo = ({ state }) =>
  state.platformApplicationInfo.android;

export const selectSelectedPlatform = ({ state }) => {
  return state.selectedPlatform;
};

export const selectCanAddPlatform = ({ state }, { platform }) =>
  getAvailablePlatformIds(state).includes(platform) &&
  !state.platformApplicationInfo[platform];

export const selectPlatformEditDefaultValues = ({ state }) => {
  return state.platformEditDefaultValues;
};

export const selectPlatformEditIconFileId = ({ state }) => {
  return state.platformEditIconFileId;
};

export const selectPlatformEditAdaptiveIconFileId = ({ state }) =>
  state.platformEditAdaptiveIconFileId;

export const selectPlatformEditSplashIconFileId = ({ state }) =>
  state.platformEditSplashIconFileId;

export const selectPlatformEditLoadingBackgroundFileId = ({ state }) =>
  state.platformEditLoadingBackgroundFileId;

export const selectPlatformEditStartBackgroundFileId = ({ state }) =>
  state.platformEditStartBackgroundFileId;

export const setPlatformEditScreenBackgroundFileId = (
  { state },
  { target, fileId },
) => {
  if (target === "loading") state.platformEditLoadingBackgroundFileId = fileId;
  else state.platformEditStartBackgroundFileId = fileId;
};

export const selectPlatformEditIconCropTarget = ({ state }) =>
  state.platformEditIconCropTarget;
export const setPlatformEditOptionalIconFileId = (
  { state },
  { target, fileId },
) => {
  if (target === "adaptive") state.platformEditAdaptiveIconFileId = fileId;
  else state.platformEditSplashIconFileId = fileId;
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

export const setPlatformEditBackgroundColor = ({ state }, { name, value }) => {
  if (name === "iconBackgroundColor") state.iconPreviewColor = value;
  if (name === "splashBackgroundColor") state.splashPreviewColor = value;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectPlatformDetailsPageCopy(i18n);
  const availablePlatformIds = getAvailablePlatformIds(state);
  const createdPlatforms = PLATFORM_IDS.filter(
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
    canAddPlatform: availablePlatformIds.some(
      (platform) => !state.platformApplicationInfo[platform],
    ),
    clickToUploadLabel: copy.clickToUpload,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
    // Tablet landscape centers the content in the Projects, About, and
    // Config column width.
    tabletLandscapeContentStyle: buildTabletLandscapeContentColumnStyle(state),
    detailFillHeight: false,
    emptyPlatformsMessage: copy.emptyPlatformsMessage,
    hasPlatformDetails: Boolean(selectedPlatformInfo),
    platformTabsLabel: copy.platformTabsLabel,
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
          state.androidSigning,
        )
      : [],
    showAndroidSigning:
      state.selectedPlatform === "android" && state.androidSigning.supported,
    showAndroidPreviousKeys:
      state.selectedPlatform === "android" &&
      state.androidSigning.supported &&
      state.androidSigning.previousKeys.length > 0,
    androidSigningKey: state.androidSigning.currentKey
      ? describeAndroidSigningKey(
          state.androidSigning.currentKey,
          copy,
          i18n.dateTime,
        )
      : undefined,
    androidPreviousKeys: state.androidSigning.previousKeys.map((key) =>
      describeAndroidSigningKey(key, copy, i18n.dateTime),
    ),
    androidSigningBusy: state.androidSigning.busy,
    androidSigningKeyNotice: copy.androidSigningKeyNotice,
    androidNoSigningKeyMessage: copy.androidNoSigningKeyMessage,
    androidSaveKeyCopyLabel: copy.androidSaveKeyCopyButton,
    androidUploadKeyLabel: copy.androidUploadKeyButton,
    androidReplaceKeyLabel: copy.androidReplaceKeyButton,
    androidCreateKeyLabel: copy.androidCreateKeyButton,
    androidUseKeyAgainLabel: copy.androidUseKeyAgainButton,
    adaptiveIconFileId: selectedPlatformInfo?.adaptiveIconFileId,
    splashIconFileId: selectedPlatformInfo?.splashIconFileId,
    platformEditAdaptiveIconFileId: state.platformEditAdaptiveIconFileId,
    platformEditSplashIconFileId: state.platformEditSplashIconFileId,
    showAndroidIcons: formPlatform === "android",
    showWebScreenBackgrounds: state.selectedPlatform === "web",
    showWebScreenBackgroundsEdit: formPlatform === "web",
    webLoadingBackgroundFileId: selectedPlatformInfo?.loadingBackgroundFileId,
    webStartBackgroundFileId: selectedPlatformInfo?.startBackgroundFileId,
    platformEditLoadingBackgroundFileId:
      state.platformEditLoadingBackgroundFileId,
    platformEditStartBackgroundFileId: state.platformEditStartBackgroundFileId,
    webDefaultScreenLabel: copy.webDefaultScreenLabel,

    removeIconLabel: copy.removeIconButton,
    usesAppIconLabel: copy.androidUsesAppIcon,
    editIconBackgroundStyle: `background-color: ${state.platformEditAdaptiveIconFileId ? state.iconPreviewColor : "transparent"};`,
    editSplashBackgroundStyle: `background-color: ${state.platformEditSplashIconFileId ? state.splashPreviewColor : "transparent"};`,
    cropTitle: copy[`${state.platformEditIconCropTarget}CropTitle`],
    cropDescription: copy[`${state.platformEditIconCropTarget}CropDescription`],
    guideCircle:
      state.platformEditIconCropTarget === "adaptive"
        ? 66 / 72
        : state.platformEditIconCropTarget === "splash"
          ? 1
          : undefined,
    showAndroidPreviews: state.selectedPlatform === "android",
    androidLauncherPreviewFileId:
      selectedPlatformInfo?.adaptiveIconFileId ??
      selectedPlatformInfo?.iconFileId,
    // Either icon fills the launcher shape, which trims its corners.
    androidLauncherPreviewSize: 96,
    androidSplashPreviewFileId:
      selectedPlatformInfo?.splashIconFileId ??
      selectedPlatformInfo?.iconFileId,
    androidSplashPreviewSize: selectedPlatformInfo?.splashIconFileId ? 96 : 67,
    androidLauncherPreviewLabel: copy.androidLauncherPreviewLabel,
    androidSplashPreviewLabel: copy.androidSplashPreviewLabel,
    androidIconBackgroundStyle: `background-color: ${selectedPlatformInfo?.iconBackgroundColor ?? "#FFFFFF"};`,
    androidSplashBackgroundStyle: `background-color: ${selectedPlatformInfo?.splashBackgroundColor ?? "#000000"};`,
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
    platformEditIconOutputSize:
      state.platformEditIconCropTarget === "splash"
        ? 768
        : formPlatform === "android"
          ? 512
          : PLATFORM_APPLICATION_ICON_OUTPUT_SIZE,
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
  if (platform === "web") {
    target.loadingBackgroundFileId = applicationInfo.loadingBackgroundFileId;
    target.startBackgroundFileId = applicationInfo.startBackgroundFileId;
  } else {
    target.iconFileId = applicationInfo?.iconFileId ?? undefined;
  }

  if (platform === "android") {
    target.adaptiveIconFileId = applicationInfo.adaptiveIconFileId;
    target.splashIconFileId = applicationInfo.splashIconFileId;
    target.iconBackgroundColor =
      applicationInfo.iconBackgroundColor ?? "#FFFFFF";
    target.splashBackgroundColor =
      applicationInfo.splashBackgroundColor ?? "#000000";
  }

  // TODO: Restore optional Windows release metadata in the UI projection.
  // if (platform === "windows") {
  //   target.publisher = applicationInfo?.publisher ?? "";
  //   target.description = applicationInfo?.description ?? "";
  //   target.copyright = applicationInfo?.copyright ?? "";
  // }

  if (!state.selectedPlatform) {
    state.selectedPlatform = platform;
  }
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform;
};

export const setSelectedPlatform = ({ state }, { platform } = {}) => {
  if (
    PLATFORM_IDS.includes(platform) &&
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
  state.addPlatformMenu.items = getAvailablePlatformIds(state)
    .filter((platform) => !state.platformApplicationInfo[platform])
    .map((platform) => ({
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
  if (platform === "android") {
    state.platformEditDefaultValues.iconBackgroundColor =
      applicationInfo.iconBackgroundColor ?? "#FFFFFF";
    state.platformEditDefaultValues.splashBackgroundColor =
      applicationInfo.splashBackgroundColor ?? "#000000";
    state.iconPreviewColor =
      state.platformEditDefaultValues.iconBackgroundColor;
    state.splashPreviewColor =
      state.platformEditDefaultValues.splashBackgroundColor;
  }
  // TODO: Restore optional Windows release metadata in dialog defaults.
  // state.platformEditDefaultValues.description = "";
  // state.platformEditDefaultValues.publisher = "";
  // state.platformEditDefaultValues.copyright = "";
  // if (platform === "windows") {
  //   state.platformEditDefaultValues.description =
  //     applicationInfo.description ?? "";
  //   state.platformEditDefaultValues.publisher =
  //     applicationInfo.publisher ?? "";
  //   state.platformEditDefaultValues.copyright =
  //     applicationInfo.copyright ?? "";
  // }
  state.platformEditIconFileId =
    platform === "web" ? undefined : applicationInfo.iconFileId;
  state.platformEditAdaptiveIconFileId = applicationInfo.adaptiveIconFileId;
  state.platformEditSplashIconFileId = applicationInfo.splashIconFileId;
  state.platformEditLoadingBackgroundFileId =
    applicationInfo.loadingBackgroundFileId;
  state.platformEditStartBackgroundFileId =
    applicationInfo.startBackgroundFileId;
};

export const openPlatformCreateDialog = (
  { state },
  { platform, applicationInfo } = {},
) => {
  if (!selectCanAddPlatform({ state }, { platform }) || !applicationInfo) {
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

export const openPlatformEditIconCropDialog = (
  { state },
  { file, target = "icon" } = {},
) => {
  state.platformEditIconCropTarget = target;
  state.isPlatformEditIconCropDialogOpen = true;
  state.platformEditIconCropFile = file;
};

export const closePlatformEditIconCropDialog = ({ state }, _payload = {}) => {
  state.isPlatformEditIconCropDialogOpen = false;
  state.platformEditIconCropFile = undefined;
};
