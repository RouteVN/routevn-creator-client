export const handleEditableImageClick = (e, deps) => {
  const { getRefIds } = deps;

  // Extract the field index from the element ID
  const fieldIndex = e.currentTarget.id.replace("editable-image-", "");

  // Get the corresponding file input and trigger click
  const refIds = getRefIds();
  const fileInputRef = refIds[`file-input-${fieldIndex}`];

  if (fileInputRef && fileInputRef.elm) {
    fileInputRef.elm.click();
  }
};

export const handleSelectChange = (e, deps) => {
  const { dispatchEvent } = deps;
  const id = e.currentTarget.id.replace("select-", "");

  dispatchEvent(
    new CustomEvent("item-update", {
      detail: {
        formValues: {
          [id]: e.detail.value,
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleEditableNumberClick = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  const fieldName = e.currentTarget.id.replace("editable-number-", "");
  const field = store.selectField(fieldName);

  // Calculate position for left-bottom placement relative to mouse cursor
  const position = {
    x: e.clientX, // Move 200px to the left of cursor
    y: e.clientY, // Move 10px down from cursor
  };

  store.showPopover({
    position,
    fields: [
      {
        name: field.name,
        inputType: "slider-input",
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
          content: "Submit",
        },
      ],
    },
    defaultValues: {
      [field.name]: field.value || 0,
    },
  });
  render();
};

export const handleFileInputChange = (e, deps) => {
  const { dispatchEvent, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(e.currentTarget.id.replace("file-input-", ""));
  const field = props.fields[fieldIndex];
  const file = e.target.files[0];

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
    e.target.value = "";
  }
};

export const handleEditableAudioClick = (e, deps) => {
  const { getRefIds } = deps;

  // Extract the field index from the element ID
  const fieldIndex = e.currentTarget.id.replace("editable-audio-", "");

  // Get the corresponding audio file input and trigger click
  const refIds = getRefIds();
  const audioFileInputRef = refIds[`file-input-${fieldIndex}`];

  if (audioFileInputRef && audioFileInputRef.elm) {
    audioFileInputRef.elm.click();
  }
};

export const handleTitleClick = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  // Calculate position for left-bottom placement relative to mouse cursor
  // Offset to the left and slightly down from the cursor
  const position = {
    x: e.clientX,
    y: e.clientY,
  };

  store.showPopover({ position });
  render();
};

export const handlePopoverClickOverlay = (_, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, dispatchEvent, render } = deps;
  const detail = e.detail;

  // Extract action and values from detail - use correct property names
  const action = detail.actionId;
  const values = detail.formValues;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    console.log("Form submit clicked - dispatching item-update event");
    console.log("Form values:", values);

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

    console.log("item-update event dispatched", values);
  }
};

export const handleColorFieldClick = (e, deps) => {
  const { store, render, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(e.currentTarget.id.replace("color-field-", ""));
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

export const handleCloseColorDialog = (e, deps) => {
  const { store, render } = deps;
  store.hideColorDialog();
  render();
};

export const handleColorFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  const detail = e.detail;

  // Extract values from detail
  const values = detail.formValues;

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

export const handleFontFieldClick = (e, deps) => {
  const { getRefIds, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(e.currentTarget.id.replace("font-field-", ""));
  const field = props.fields[fieldIndex];

  if (field && field.editable) {
    // Get the corresponding file input and trigger click
    const refIds = getRefIds();
    const fileInputRef = refIds[`file-input-${fieldIndex}`];

    if (fileInputRef && fileInputRef.elm) {
      fileInputRef.elm.click();
    }
  }
};

export const handleTypographyFieldClick = (e, deps) => {
  const { store, render, props } = deps;

  // Extract the field index from the element ID
  const fieldIndex = parseInt(
    e.currentTarget.id.replace("typography-field-", ""),
  );
  const field = props.fields[fieldIndex];

  if (field && field.type === "typography" && field.editable) {
    // Open typography dialog with current typography data
    store.showTypographyDialog({
      fieldIndex,
      itemData: {
        fontSize: field.fontSize || "16",
        fontColor: field.colorId || "",
        fontStyle: field.fontId || "",
        fontWeight: field.fontWeight || "normal",
        previewText: field.previewText || "",
      },
      colorOptions: field.colorOptions || [],
      fontOptions: field.fontOptions || [],
    });
    render();
  }
};

export const handleEditableTextClick = (e, deps) => {
  console.log("@##################");
  const { store, render } = deps;
  e.preventDefault();

  const fieldName = e.currentTarget.id.replace("editable-text-", "");

  const field = store.selectField(fieldName);

  // Calculate position for left-bottom placement relative to mouse cursor
  // Offset to the left and slightly down from the cursor
  const position = {
    x: e.clientX,
    y: e.clientY,
  };

  store.showPopover({
    position,
    fields: [
      {
        name: field.name,
        inputType: "inputText",
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
          content: "Submit",
        },
      ],
    },
    defaultValues: {
      [field.name]: field.value || "",
    },
  });
  render();
};

export const handleCloseTypographyDialog = (e, deps) => {
  const { store, render } = deps;
  store.hideTypographyDialog();
  render();
};

export const handleTypographyFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  const detail = e.detail;

  // Extract values from detail
  const values = detail.formValues;

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

export const handleImageSelectorFieldClick = (e, deps) => {
  const { store, render, props, dispatchEvent } = deps;

  console.log("handleImageSelectorFieldClick called");
  console.log("event target:", e.currentTarget);
  console.log("event target id:", e.currentTarget.id);

  // Extract field index from element ID
  const fieldIndex = parseInt(
    e.currentTarget.id.replace("image-selector-field-", ""),
  );
  const field = props.fields[fieldIndex];

  console.log("fieldIndex:", fieldIndex);
  console.log("field:", field);
  console.log("props.fields:", props.fields);

  if (field && field.type === "image-selector" && field.editable) {
    console.log("dispatching request-image-groups event");
    // Request groups data from parent component
    dispatchEvent(
      new CustomEvent("request-image-groups", {
        detail: { fieldIndex, currentValue: field.value },
        bubbles: true,
        composed: true,
      }),
    );
  } else {
    console.log("field not found, not image-selector type, or not editable");
  }
};

export const handleImageSelectorSelection = (e, deps) => {
  const { store, render } = deps;
  const { imageId } = e.detail;

  store.setTempSelectedImageId({ imageId });
  render();
};

export const handleConfirmImageSelection = (e, deps) => {
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

export const handleCancelImageSelection = (e, deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleCloseImageSelectorDialog = (e, deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleShowImageSelectorDialog = (e, deps) => {
  const { store, render } = deps;
  const { fieldIndex, groups, currentValue } = e.detail;

  store.showImageSelectorDialog({
    fieldIndex,
    groups,
    currentValue,
  });
  render();
};

export const handleClearImage = (e, deps) => {
  const { props, dispatchEvent } = deps;

  // Extract field index from element ID
  const fieldIndex = parseInt(e.currentTarget.id.replace("clear-image-", ""));
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
