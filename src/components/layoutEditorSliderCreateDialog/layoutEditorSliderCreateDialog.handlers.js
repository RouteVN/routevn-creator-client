const propsChanged = (oldProps = {}, newProps = {}) => {
  return (
    oldProps.direction !== newProps.direction ||
    oldProps.defaultValues !== newProps.defaultValues
  );
};

const createValidationErrors = (images = {}) => {
  const errors = {};

  if (!images.barImageId) {
    errors.barImageId = "Bar image is required.";
  }

  if (!images.thumbImageId) {
    errors.thumbImageId = "Thumb image is required.";
  }

  return errors;
};

export const handleBeforeMount = (deps) => {
  deps.store.syncFromProps({
    props: deps.props,
  });
};

export const handleOnUpdate = (deps, payload = {}) => {
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  deps.store.syncFromProps({
    props: newProps,
  });
  deps.render();
};

export const handleImageFieldClick = (deps, payload) => {
  const fieldName = payload._event.currentTarget?.dataset?.fieldName;
  if (!fieldName) {
    return;
  }

  deps.store.openImageSelectorDialog({
    fieldName,
  });
  deps.render();
};

export const handleImageClearClick = (deps, payload) => {
  const fieldName = payload._event.currentTarget?.dataset?.fieldName;
  if (!fieldName) {
    return;
  }

  deps.store.setImage({
    fieldName,
    imageId: undefined,
  });
  deps.render();
};

export const handleImageSelected = (deps, payload) => {
  deps.store.setImageSelectorSelectedImageId({
    imageId: payload._event.detail?.imageId,
  });
  deps.render();
};

export const handleImageSelectorCancel = (deps) => {
  deps.store.closeImageSelectorDialog();
  deps.render();
};

export const handleImageSelectorSubmit = (deps) => {
  const imageSelectorDialog = deps.store.selectImageSelectorDialog();
  if (imageSelectorDialog.fieldName) {
    deps.store.setImage({
      fieldName: imageSelectorDialog.fieldName,
      imageId: imageSelectorDialog.selectedImageId,
    });
  }

  deps.store.closeImageSelectorDialog();
  deps.render();
};

export const handleValidate = (deps) => {
  const formValidation = deps.refs.sliderCreateForm?.validate?.() ?? {
    valid: false,
    errors: {
      form: "Form is not ready.",
    },
  };
  const validationErrors = createValidationErrors(deps.store.selectImages());

  deps.store.setValidationErrors({
    errors: validationErrors,
  });
  deps.render();

  const errors = Object.assign({}, formValidation.errors ?? {});
  for (const [key, value] of Object.entries(validationErrors)) {
    errors[key] = value;
  }

  return {
    valid:
      formValidation.valid !== false &&
      Object.keys(validationErrors).length === 0,
    errors,
  };
};

export const handleGetValues = (deps) => {
  const values = Object.assign(
    {},
    deps.refs.sliderCreateForm?.getValues?.() ?? {},
  );
  const images = deps.store.selectImages();

  values.barImageId = images.barImageId;
  values.thumbImageId = images.thumbImageId;
  values.hoverBarImageId = images.hoverBarImageId;
  values.hoverThumbImageId = images.hoverThumbImageId;

  return values;
};
