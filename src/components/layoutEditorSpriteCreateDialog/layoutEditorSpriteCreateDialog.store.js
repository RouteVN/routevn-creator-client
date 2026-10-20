import { toFlatItems } from "../../internal/project/tree.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";

const createDefaultValuesFromProps = (props = {}) => {
  const source = props.defaultValues ?? {};

  return {
    name: source.name ?? "Image",
  };
};

export const createInitialState = () => {
  return {
    formKey: 0,
    defaultValues: createDefaultValuesFromProps(),
    imageId: undefined,
    imageSelectorDialog: {
      open: false,
      selectedImageId: undefined,
    },
    images: {
      items: {},
      tree: [],
    },
    fullImagePreviewVisible: false,
    fullImagePreviewImageId: undefined,
    validationErrors: {},
    isTouchMode: false,
  };
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const syncFromProps = ({ state }, { props } = {}) => {
  const source = props?.defaultValues ?? {};
  state.formKey += 1;
  state.defaultValues = createDefaultValuesFromProps(props);
  state.imageId = source.imageId ?? undefined;
  state.imageSelectorDialog = {
    open: false,
    selectedImageId: undefined,
  };
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.validationErrors = {};
};

export const setImageId = ({ state }, { imageId } = {}) => {
  state.imageId = imageId;
  delete state.validationErrors.imageId;
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = images ?? {
    items: {},
    tree: [],
  };
};

export const openImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.selectedImageId = state.imageId;
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog.open = false;
  state.imageSelectorDialog.selectedImageId = undefined;
};

export const setImageSelectorSelectedImageId = (
  { state },
  { imageId } = {},
) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const setValidationErrors = ({ state }, { errors } = {}) => {
  state.validationErrors = errors ?? {};
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewImageId = imageId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
};

export const selectImageId = ({ state }) => {
  return state.imageId;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

const localizeSpriteCreateForm = (form = {}, i18n = {}) => {
  const fieldLabels = {
    name: i18n.resourcePages?.nameLabel,
    "sprite-image": i18n.layoutEditPanel?.imageLabel,
  };

  return {
    ...form,
    fields: form.fields?.map((field) => ({
      ...field,
      label: fieldLabels[field.name ?? field.slot] ?? field.label,
    })),
  };
};

export const selectViewData = ({ state, constants, i18n = {} }) => {
  const panelCopy = i18n.layoutEditPanel ?? {};
  const fileExplorerItems = toFlatItems(state.images).filter(
    (item) => item.type === "folder",
  );

  return {
    form: localizeSpriteCreateForm(constants.spriteCreateForm, i18n),
    selectImageLabel: panelCopy.selectImageLabel ?? "Select image",
    cancelButton: i18n.resourcePages?.cancelButton ?? "Cancel",
    okButton: panelCopy.okButton ?? "OK",
    formKey: state.formKey,
    defaultValues: state.defaultValues,
    imageId: state.imageId,
    imageSelectorDialog: state.imageSelectorDialog,
    fileExplorerItems,
    showImageSelectorFileExplorer: !state.isTouchMode,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
    validationErrors: state.validationErrors,
  };
};
