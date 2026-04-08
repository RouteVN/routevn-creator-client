import { toFlatItems } from "../../internal/project/tree.js";

const createDefaultValuesFromProps = (props = {}) => {
  const source = props.defaultValues ?? {};

  return {
    name: source.name ?? "Sprite",
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
  };
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

export const selectViewData = ({ state, constants }) => {
  const fileExplorerItems = toFlatItems(state.images).filter(
    (item) => item.type === "folder",
  );

  return {
    form: constants.spriteCreateForm,
    formKey: state.formKey,
    defaultValues: state.defaultValues,
    imageId: state.imageId,
    imageSelectorDialog: state.imageSelectorDialog,
    fileExplorerItems,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
    validationErrors: state.validationErrors,
  };
};
