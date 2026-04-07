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
  state.validationErrors = {};
};

export const setImageId = ({ state }, { imageId } = {}) => {
  state.imageId = imageId;
  delete state.validationErrors.imageId;
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

export const selectImageId = ({ state }) => {
  return state.imageId;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const selectViewData = ({ state, constants }) => {
  return {
    form: constants.spriteCreateForm,
    formKey: state.formKey,
    defaultValues: state.defaultValues,
    imageId: state.imageId,
    imageSelectorDialog: state.imageSelectorDialog,
    validationErrors: state.validationErrors,
  };
};
