import { toFlatItems } from "../../internal/project/tree.js";

const createEmptyImages = () => ({
  barImageId: undefined,
  thumbImageId: undefined,
  hoverBarImageId: undefined,
  hoverThumbImageId: undefined,
});

const normalizeDirection = (direction) => {
  return direction === "vertical" ? "vertical" : "horizontal";
};

const createDefaultValuesFromProps = (props = {}) => {
  const source = props.defaultValues ?? {};

  return {
    name: source.name ?? "Slider",
    direction: normalizeDirection(source.direction ?? props.direction),
  };
};

const createImagesFromProps = (props = {}) => {
  const source = props.defaultValues ?? {};

  return {
    barImageId: source.barImageId ?? undefined,
    thumbImageId: source.thumbImageId ?? undefined,
    hoverBarImageId: source.hoverBarImageId ?? undefined,
    hoverThumbImageId: source.hoverThumbImageId ?? undefined,
  };
};

export const createInitialState = () => {
  return {
    formKey: 0,
    defaultValues: createDefaultValuesFromProps(),
    images: createEmptyImages(),
    imageSelectorDialog: {
      open: false,
      fieldName: undefined,
      selectedImageId: undefined,
    },
    imagesData: {
      items: {},
      tree: [],
    },
    fullImagePreviewVisible: false,
    fullImagePreviewImageId: undefined,
    validationErrors: {},
  };
};

export const syncFromProps = ({ state }, { props } = {}) => {
  state.formKey += 1;
  state.defaultValues = createDefaultValuesFromProps(props);
  state.images = createImagesFromProps(props);
  state.imageSelectorDialog = {
    open: false,
    fieldName: undefined,
    selectedImageId: undefined,
  };
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.validationErrors = {};
};

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData ?? {
    items: {},
    tree: [],
  };
};

export const setImage = ({ state }, { fieldName, imageId } = {}) => {
  if (!fieldName) {
    return;
  }

  state.images[fieldName] = imageId;
  delete state.validationErrors[fieldName];
};

export const openImageSelectorDialog = ({ state }, { fieldName } = {}) => {
  if (!fieldName) {
    return;
  }

  state.imageSelectorDialog = {
    open: true,
    fieldName,
    selectedImageId: state.images[fieldName],
  };
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog = {
    open: false,
    fieldName: undefined,
    selectedImageId: undefined,
  };
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

export const selectImages = ({ state }) => {
  return state.images;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const selectViewData = ({ state, constants }) => {
  const fileExplorerItems = toFlatItems(state.imagesData).filter(
    (item) => item.type === "folder",
  );

  return {
    form: constants.sliderCreateForm,
    formKey: state.formKey,
    defaultValues: state.defaultValues,
    images: state.images,
    imageSelectorDialog: state.imageSelectorDialog,
    fileExplorerItems,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
    validationErrors: state.validationErrors,
  };
};
