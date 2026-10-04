import {
  createPlatformEditForm,
  PLATFORM_APPLICATION_ICON_OUTPUT_SIZE,
} from "../../internal/ui/platformDetailsForm.js";

export const createInitialState = () => ({
  platform: "web",
  formKey: 0,
  defaultValues: {
    applicationName: "",
    applicationIdentifier: "",
  },
  iconFileId: undefined,
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
  state.iconFileId =
    state.platform === "web" ? undefined : applicationInfo.iconFileId;
  state.isIconCropDialogOpen = false;
  state.iconCropFile = undefined;
};

export const selectPlatform = ({ state }) => state.platform;

export const selectIconFileId = ({ state }) => state.iconFileId;

export const selectIsIconCropDialogOpen = ({ state }) =>
  state.isIconCropDialogOpen;

export const setIconFileId = ({ state }, { iconFileId } = {}) => {
  state.iconFileId = iconFileId;
};

export const openIconCropDialog = ({ state }, { file } = {}) => {
  state.isIconCropDialogOpen = true;
  state.iconCropFile = file;
};

export const closeIconCropDialog = ({ state }, _payload = {}) => {
  state.isIconCropDialogOpen = false;
  state.iconCropFile = undefined;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = i18n.platformDetailsPage;

  return {
    clickToUploadLabel: copy.clickToUpload,
    defaultValues: state.defaultValues,
    form: createPlatformEditForm(state.platform, "create", copy),
    formKey: state.formKey,
    iconCropFile: state.iconCropFile,
    iconFileId: state.iconFileId,
    iconOutputSize: PLATFORM_APPLICATION_ICON_OUTPUT_SIZE,
    isIconCropDialogOpen: state.isIconCropDialogOpen,
    showIcon: state.platform !== "web",
  };
};
