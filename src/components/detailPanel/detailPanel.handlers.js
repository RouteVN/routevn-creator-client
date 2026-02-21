export const handleEditableImageClick = (deps, payload) => {
  const { refs } = deps;

  // Extract the field index from the element ID
  const fieldIndex = payload._event.currentTarget.id.replace(
    "editableImage",
    "",
  );

  // Get the corresponding file input and trigger click
  const refIds = refs;
  const fileInputRef = refIds[`fileInput${fieldIndex}`];

  if (fileInputRef) {
    fileInputRef.click();
  }
};

export const handleSelectChange = (deps, payload) => {
  const { dispatchEvent } = deps;
  const target = payload._event.currentTarget;
  const id =
    target?.dataset?.fieldName || target?.id?.replace("select", "") || "";

  dispatchEvent(
    new CustomEvent("item-update", {
      detail: {
        formValues: {
          [id]: payload._event.detail.value,
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleEditableNumberClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const target = payload._event.currentTarget;
  const fieldName =
    target?.dataset?.fieldName ||
    target?.id?.replace("editableNumber", "") ||
    "";
  const field = store.selectField(fieldName);

  // Calculate position for left-bottom placement relative to mouse cursor
  const position = {
    x: payload._event.clientX, // Move 200px to the left of cursor
    y: payload._event.clientY, // Move 10px down from cursor
  };

  store.showPopover({
    position,
    fields: [
      {
        name: field.name,
        type: "slider-input",
        label: field.label,
        description: field.description || "Adjust the value",
        min: field.min || 0,
        max: field.max || 100,
        step: field.step || 1,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Submit",
        },
      ],
    },
    defaultValues: {
      [field.name]: field.value || 0,
    },
  });
  render();
};

export const handleFileInputChange = (deps, payload) => {
  const { dispatchEvent, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(
    payload._event.currentTarget.id.replace("fileInput", ""),
  );
  const field = props.fields[fieldIndex];
  const file = payload._event.target.files[0];

  if (file && field) {
    // Emit event to parent component with file and field information
    dispatchEvent(
      new CustomEvent("replace-item", {
        detail: {
          file,
          field,
          fieldIndex,
        },
        bubbles: true,
        composed: true,
      }),
    );

    // Reset the file input for future uploads
    payload._event.target.value = "";
  }
};

export const handleEditableAudioClick = (deps, payload) => {
  const { refs } = deps;

  // Extract the field index from the element ID
  const fieldIndex = payload._event.currentTarget.id.replace(
    "editableAudio",
    "",
  );

  // Get the corresponding audio file input and trigger click
  const refIds = refs;
  const audioFileInputRef = refIds[`fileInput${fieldIndex}`];

  if (audioFileInputRef) {
    audioFileInputRef.click();
  }
};

export const handleTitleClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  // Calculate position for left-bottom placement relative to mouse cursor
  // Offset to the left and slightly down from the cursor
  const position = {
    x: payload._event.clientX,
    y: payload._event.clientY,
  };

  store.showPopover({ position });
  render();
};

export const handlePopoverClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = (deps, payload) => {
  const { store, dispatchEvent, render } = deps;
  const detail = payload._event.detail;

  // Extract action and values from detail - use correct property names
  const action = detail.actionId;
  const values = detail.values;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    // Hide popover
    store.hidePopover();
    render();

    // Emit file-action event for rename confirmation
    dispatchEvent(
      new CustomEvent("item-update", {
        detail: {
          formValues: values,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleColorFieldClick = (deps, payload) => {
  const { store, render, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(
    payload._event.currentTarget.id.replace("colorField", ""),
  );
  const field = props.fields[fieldIndex];

  if (field && field.type === "color" && field.editable) {
    // Open color dialog with current color data
    store.showColorDialog({
      fieldIndex,
      itemData: {
        name: field.name || "",
        value: field.value || "#000000",
      },
    });
    render();
  }
};

export const handleCloseColorDialog = (deps) => {
  const { store, render } = deps;
  store.hideColorDialog();
  render();
};

export const handleColorFormActionClick = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const detail = payload._event.detail;

  // Extract values from detail
  const values = detail.values;

  // Get current dialog state
  const state = store.getState ? store.getState() : store._state || store.state;
  const fieldIndex = state.colorDialog.fieldIndex;

  // Hide dialog
  store.hideColorDialog();
  render();

  // Emit color-updated event for editing existing color
  dispatchEvent(
    new CustomEvent("color-updated", {
      detail: {
        fieldIndex,
        hex: values.hex,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleFontFieldClick = (deps, payload) => {
  const { refs, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(
    payload._event.currentTarget.id.replace("fontField", ""),
  );
  const field = props.fields[fieldIndex];

  if (field && field.editable) {
    // Get the corresponding file input and trigger click
    const refIds = refs;
    const fileInputRef = refIds[`fileInput${fieldIndex}`];

    if (fileInputRef) {
      fileInputRef.click();
    }
  }
};

export const handleTypographySelectChange = (deps, payload) => {
  const { props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(
    payload._event.currentTarget.id.replace("typographySelect", ""),
  );
  const field = props.fields[fieldIndex];
  const selectedValue = payload._event.detail.value;

  if (
    field &&
    field.type === "typography" &&
    field.editable &&
    props.onFieldChange
  ) {
    props.onFieldChange({
      fieldName: field.name,
      value: selectedValue,
      index: fieldIndex,
    });
  }
};

export const handleEditableTextClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const target = payload._event.currentTarget;
  const fieldName =
    target?.dataset?.fieldName || target?.id?.replace("editableText", "") || "";

  const field = store.selectField(fieldName);

  // Calculate position for left-bottom placement relative to mouse cursor
  // Offset to the left and slightly down from the cursor
  const position = {
    x: payload._event.clientX,
    y: payload._event.clientY,
  };

  store.showPopover({
    position,
    fields: [
      {
        name: field.name,
        type: "input-text",
        label: field.label,
        description: "Enter new name",
        placeholder: field.value || "",
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Submit",
        },
      ],
    },
    defaultValues: {
      [field.name]: field.value || "",
    },
  });
  render();
};

export const handleCloseTypographyDialog = (deps) => {
  const { store, render } = deps;
  store.hideTypographyDialog();
  render();
};

export const handleTypographyFormActionClick = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const detail = payload._event.detail;

  // Extract values from detail
  const values = detail.values;

  // Get current dialog state
  const state = store.getState ? store.getState() : store._state || store.state;
  const fieldIndex = state.typographyDialog.fieldIndex;

  // Hide dialog
  store.hideTypographyDialog();
  render();

  // Emit typography-updated event for editing existing typography
  dispatchEvent(
    new CustomEvent("typography-updated", {
      detail: {
        fieldIndex,
        fontSize: values.fontSize,
        fontColor: values.fontColor,
        fontStyle: values.fontStyle,
        fontWeight: values.fontWeight,
        previewText: values.previewText,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleImageSelectorFieldClick = (deps, payload) => {
  const { props, dispatchEvent } = deps;

  // Extract field index from element ID
  const fieldIndex = parseInt(
    payload._event.currentTarget.id.replace("imageSelectorField", ""),
  );
  const field = props.fields[fieldIndex];

  if (field && field.type === "image-selector" && field.editable) {
    // Request groups data from parent component
    dispatchEvent(
      new CustomEvent("request-image-groups", {
        detail: { fieldIndex, currentValue: field.value },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleImageSelectorSelection = (deps, payload) => {
  const { store, render } = deps;
  const { imageId } = payload._event.detail;

  store.setTempSelectedImageId({ imageId });
  render();
};

export const handleConfirmImageSelection = (deps) => {
  const { store, render, dispatchEvent } = deps;

  const state = store.getState ? store.getState() : store._state || store.state;
  const fieldIndex = state.imageSelectorDialog.fieldIndex;
  const selectedImageId = state.imageSelectorDialog.selectedImageId;

  // Hide dialog
  store.hideImageSelectorDialog();
  render();

  // Emit update event
  dispatchEvent(
    new CustomEvent("image-selector-updated", {
      detail: {
        fieldIndex,
        imageId: selectedImageId,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleCancelImageSelection = (deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleCloseImageSelectorDialog = (deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleShowImageSelectorDialog = (deps, payload) => {
  const { store, render } = deps;
  const { fieldIndex, groups, currentValue } = payload._event.detail;

  store.showImageSelectorDialog({
    fieldIndex,
    groups,
    currentValue,
  });
  render();
};

export const handleClearImage = (deps, payload) => {
  const { props, dispatchEvent } = deps;

  // Extract field index from element ID
  const fieldIndex = parseInt(
    payload._event.currentTarget.id.replace("clearImage", ""),
  );
  const field = props.fields[fieldIndex];

  if (field && field.type === "image-selector") {
    // Emit update event to clear the image
    dispatchEvent(
      new CustomEvent("image-selector-updated", {
        detail: {
          fieldIndex,
          imageId: null,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
};
