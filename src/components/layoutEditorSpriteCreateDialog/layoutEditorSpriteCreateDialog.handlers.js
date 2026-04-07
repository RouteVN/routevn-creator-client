const propsChanged = (oldProps = {}, newProps = {}) => {
  return oldProps.defaultValues !== newProps.defaultValues;
};

const createValidationErrors = (imageId) => {
  const errors = {};

  if (!imageId) {
    errors.imageId = "Image is required.";
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

export const handleImageFieldClick = (deps) => {
  deps.store.openImageSelectorDialog();
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
  deps.store.setImageId({
    imageId: imageSelectorDialog.selectedImageId,
  });
  deps.store.closeImageSelectorDialog();
  deps.render();
};

export const handleValidate = (deps) => {
  const formValidation = deps.refs.spriteCreateForm?.validate?.() ?? {
    valid: false,
    errors: {
      form: "Form is not ready.",
    },
  };
  const validationErrors = createValidationErrors(deps.store.selectImageId());

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
    deps.refs.spriteCreateForm?.getValues?.() ?? {},
  );
  values.imageId = deps.store.selectImageId();

  return values;
};
