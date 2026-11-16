import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";
import { normalizeWebScreenFadeDuration } from "../../internal/webExport.js";
import {
  createPlatformEditForm,
  getPlatformIconOutputSize,
  getScreenBackgroundPreviewSize,
} from "../../internal/ui/platformDetailsForm.js";

export const createInitialState = () => ({
  platform: "web",
  iconPreviewColor: "#FFFFFF",
  splashPreviewColor: "#000000",
  formKey: 0,
  defaultValues: {
    applicationName: "",
    applicationIdentifier: "",
  },
  iconFileId: undefined,
  adaptiveIconFileId: undefined,
  splashIconFileId: undefined,
  // Web: the pictures behind the loading and start screens, in the
  // project's shape.
  loadingBackgroundFileId: undefined,
  startBackgroundFileId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  iconCropTarget: "icon",
  isIconCropDialogOpen: false,
  iconCropFile: undefined,
});

export const syncFromProps = ({ state }, { props } = {}) => {
  const applicationInfo = props?.applicationInfo ?? {};
  state.platform = props?.platform ?? "web";
  state.formKey += 1;
  state.defaultValues.applicationName = applicationInfo.applicationName ?? "";
  state.defaultValues.applicationIdentifier =
    applicationInfo.applicationIdentifier ?? "";
  if (state.platform === "android") {
    state.defaultValues.iconBackgroundColor =
      applicationInfo.iconBackgroundColor ?? "#FFFFFF";
    state.defaultValues.splashBackgroundColor =
      applicationInfo.splashBackgroundColor ?? "#000000";
    state.iconPreviewColor = state.defaultValues.iconBackgroundColor;
    state.splashPreviewColor = state.defaultValues.splashBackgroundColor;
  }
  if (state.platform === "web") {
    // Both fades start at the default length, as in Platform Details.
    state.defaultValues.loadingFadeDuration = normalizeWebScreenFadeDuration(
      applicationInfo.loadingFadeDuration,
    );
    state.defaultValues.startFadeDuration = normalizeWebScreenFadeDuration(
      applicationInfo.startFadeDuration,
    );
  }
  state.iconFileId =
    state.platform === "web" ? undefined : applicationInfo.iconFileId;
  state.adaptiveIconFileId = applicationInfo.adaptiveIconFileId;
  state.splashIconFileId = applicationInfo.splashIconFileId;
  state.loadingBackgroundFileId = applicationInfo.loadingBackgroundFileId;
  state.startBackgroundFileId = applicationInfo.startBackgroundFileId;
  state.isIconCropDialogOpen = false;
  state.iconCropFile = undefined;
};

export const selectPlatform = ({ state }) => state.platform;

export const selectIconFileId = ({ state }) => state.iconFileId;

export const selectAdaptiveIconFileId = ({ state }) => state.adaptiveIconFileId;

export const selectSplashIconFileId = ({ state }) => state.splashIconFileId;

export const selectIconCropTarget = ({ state }) => state.iconCropTarget;

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = projectResolution ?? DEFAULT_PROJECT_RESOLUTION;
};

export const selectProjectResolution = ({ state }) => state.projectResolution;

export const selectLoadingBackgroundFileId = ({ state }) =>
  state.loadingBackgroundFileId;

export const selectStartBackgroundFileId = ({ state }) =>
  state.startBackgroundFileId;

export const selectScreenBackgroundFileId = ({ state }, { target } = {}) =>
  target === "loading"
    ? state.loadingBackgroundFileId
    : state.startBackgroundFileId;

export const setScreenBackgroundFileId = ({ state }, { target, fileId }) => {
  if (target === "loading") state.loadingBackgroundFileId = fileId;
  else state.startBackgroundFileId = fileId;
};

export const setOptionalIconFileId = ({ state }, { target, fileId }) => {
  if (target === "adaptive") state.adaptiveIconFileId = fileId;
  else state.splashIconFileId = fileId;
};

export const selectIsIconCropDialogOpen = ({ state }) =>
  state.isIconCropDialogOpen;

export const setIconFileId = ({ state }, { iconFileId } = {}) => {
  state.iconFileId = iconFileId;
};

export const openIconCropDialog = (
  { state },
  { file, target = "icon" } = {},
) => {
  state.iconCropTarget = target;
  state.isIconCropDialogOpen = true;
  state.iconCropFile = file;
};

export const closeIconCropDialog = ({ state }, _payload = {}) => {
  state.isIconCropDialogOpen = false;
  state.iconCropFile = undefined;
};

export const setBackgroundColor = ({ state }, { name, value }) => {
  if (name === "iconBackgroundColor") state.iconPreviewColor = value;
  if (name === "splashBackgroundColor") state.splashPreviewColor = value;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = i18n.platformDetailsPage;
  const screenBackgroundPreview = getScreenBackgroundPreviewSize(
    state.projectResolution,
  );
  const screenBackgroundPreviewSizeStyle = `width: ${screenBackgroundPreview.width}px; height: ${screenBackgroundPreview.height}px;`;

  return {
    showWebScreenBackgrounds: state.platform === "web",
    loadingBackgroundFileId: state.loadingBackgroundFileId,
    startBackgroundFileId: state.startBackgroundFileId,
    screenBackgroundPreviewWidth: screenBackgroundPreview.width,
    screenBackgroundPreviewHeight: screenBackgroundPreview.height,
    screenBackgroundPreviewStyle: `${screenBackgroundPreviewSizeStyle} background: #000; border-radius: 6px; overflow: hidden;`,
    screenBackgroundButtonStyle: `${screenBackgroundPreviewSizeStyle} padding: 0; border: 0; background: transparent; cursor: pointer;`,
    adaptiveIconFileId: state.adaptiveIconFileId,
    splashIconFileId: state.splashIconFileId,
    showAndroidIcons: state.platform === "android",
    removeIconLabel: copy.removeIconButton,
    iconBackgroundStyle: `background-color: ${state.adaptiveIconFileId ? state.iconPreviewColor : "transparent"};`,
    splashBackgroundStyle: `background-color: ${state.splashIconFileId ? state.splashPreviewColor : "transparent"};`,
    cropTitle: copy[`${state.iconCropTarget}CropTitle`],
    cropDescription: copy[`${state.iconCropTarget}CropDescription`],
    guideCircle:
      state.iconCropTarget === "adaptive"
        ? 66 / 72
        : state.iconCropTarget === "splash"
          ? 1
          : undefined,
    clickToUploadLabel: copy.clickToUpload,
    defaultValues: state.defaultValues,
    form: createPlatformEditForm(state.platform, "create", copy),
    formKey: state.formKey,
    iconCropFile: state.iconCropFile,
    iconFileId: state.iconFileId,
    iconOutputSize: getPlatformIconOutputSize(
      state.platform,
      state.iconCropTarget,
    ),
    isIconCropDialogOpen: state.isIconCropDialogOpen,
    showIcon: state.platform !== "web",
  };
};
