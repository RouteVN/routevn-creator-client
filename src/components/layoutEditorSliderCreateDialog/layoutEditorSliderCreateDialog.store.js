import { toFlatItems } from "../../internal/project/tree.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";

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
    isTouchMode: false,
  };
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
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

const localizeSliderCreateForm = (form = {}, i18n = {}) => {
  const editorCopy = i18n.layoutEditorPage ?? {};
  const panelCopy = i18n.layoutEditPanel ?? {};
  const fieldLabels = {
    name: i18n.resourcePages?.nameLabel,
    direction: panelCopy.directionSection,
    "slider-bar-image": editorCopy.sliderBarImageLabel,
    "slider-thumb-image": editorCopy.sliderThumbImageLabel,
    "slider-hover-bar-image": editorCopy.sliderHoverBarImageLabel,
    "slider-hover-thumb-image": editorCopy.sliderHoverThumbImageLabel,
  };
  const optionLabels = {
    horizontal: panelCopy.horizontalOption,
    vertical: panelCopy.verticalOption,
  };

  return {
    ...form,
    fields: form.fields?.map((field) => {
      const localizedField = {
        ...field,
        label: fieldLabels[field.name ?? field.slot] ?? field.label,
      };
      if (field.type === "select") {
        localizedField.placeholder =
          i18n.resourcePages?.selectOptionPlaceholder;
      }
      if (Array.isArray(field.options)) {
        localizedField.options = field.options.map((option) => ({
          ...option,
          label: optionLabels[option.value] ?? option.label,
        }));
      }
      return localizedField;
    }),
  };
};

export const selectViewData = ({ state, constants, i18n = {} }) => {
  const editorCopy = i18n.layoutEditorPage ?? {};
  const fileExplorerItems = toFlatItems(state.imagesData).filter(
    (item) => item.type === "folder",
  );

  return {
    form: localizeSliderCreateForm(constants.sliderCreateForm, i18n),
    selectBarImageLabel: editorCopy.selectBarImageLabel ?? "Select bar image",
    selectThumbImageLabel:
      editorCopy.selectThumbImageLabel ?? "Select thumb image",
    selectHoverBarImageLabel:
      editorCopy.selectHoverBarImageLabel ?? "Select hover bar image",
    selectHoverThumbImageLabel:
      editorCopy.selectHoverThumbImageLabel ?? "Select hover thumb image",
    clearImageButton: editorCopy.clearImageButton ?? "Clear",
    cancelButton: i18n.resourcePages?.cancelButton ?? "Cancel",
    okButton: i18n.layoutEditPanel?.okButton ?? "OK",
    formKey: state.formKey,
    defaultValues: state.defaultValues,
    images: state.images,
    imageSelectorDialog: state.imageSelectorDialog,
    fileExplorerItems,
    showImageSelectorFileExplorer: !state.isTouchMode,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
    validationErrors: state.validationErrors,
  };
};
