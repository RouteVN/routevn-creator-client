import { toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  // Popover state for renaming
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    fields: [],
    actions: [],
    defaultValues: {},
  },
  // Text dialog state
  textDialog: {
    isOpen: false,
    fieldIndex: -1,
    fieldLabel: "",
    defaultValues: {
      text: "",
    },
    form: {
      title: "Edit Text",
      description: "Edit the text value",
      fields: [
        {
          name: "text",
          inputType: "inputTextArea",
          label: "Text",
          description: "Enter the text",
          required: true,
        },
      ],
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            content: "Update Text",
          },
        ],
      },
    },
  },
  // Color dialog state
  colorDialog: {
    isOpen: false,
    fieldIndex: -1,
    defaultValues: {
      hex: "#ff0000",
    },
    form: {
      title: "Edit Color",
      description: "Edit the color",
      fields: [
        {
          name: "hex",
          inputType: "colorPicker",
          label: "Hex Value",
          description: "Enter the hex color value (e.g., #ff0000)",
          required: true,
        },
      ],
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            content: "Update Color",
          },
        ],
      },
    },
  },
  // Typography dialog state
  typographyDialog: {
    isOpen: false,
    fieldIndex: -1,
    defaultValues: {
      fontSize: "16",
      fontColor: "",
      fontStyle: "",
      fontWeight: "normal",
      previewText: "",
    },
    form: {
      title: "Edit Typography",
      description: "Edit the typography style",
      fields: [
        {
          name: "fontColor",
          inputType: "select",
          label: "Font Color",
          description: "Select a font color",
          placeholder: "Choose a color",
          options: [], // Will be populated dynamically
          required: true,
        },
        {
          name: "fontStyle",
          inputType: "select",
          label: "Font Style",
          description: "Select a font style",
          placeholder: "Choose a font",
          options: [], // Will be populated dynamically
          required: true,
        },
        {
          name: "fontSize",
          inputType: "inputText",
          label: "Font Size",
          description: "Enter the font size (e.g., 16, 18, 24)",
          required: true,
        },
        {
          name: "fontWeight",
          inputType: "inputText",
          label: "Font Weight",
          description: "Enter the font weight (e.g., normal, bold, 400, 700)",
          required: true,
        },
        {
          name: "previewText",
          inputType: "inputText",
          label: "Preview Text",
          description: "Text to display in the typography preview",
          required: false,
        },
      ],
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            content: "Update Typography",
          },
        ],
      },
    },
  },
  // Image selector dialog state
  imageSelectorDialog: {
    isOpen: false,
    fieldIndex: -1,
    groups: [],
    selectedImageId: null,
  },
});

export const selectField = ({ props }, name) => {
  console.log("props.fields", props.fields);
  return props.fields.find((field) => field.name === name);
};

export const showPopover = (
  state,
  { position, fields, actions, defaultValues = {} },
) => {
  state.popover = {
    isOpen: true,
    position,
    fields,
    actions,
    defaultValues,
  };
};

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    position: { x: 0, y: 0 },
  };
};

export const showColorDialog = (state, { fieldIndex, itemData }) => {
  state.colorDialog.isOpen = true;
  state.colorDialog.fieldIndex = fieldIndex;

  // Update default values with current item data
  state.colorDialog.defaultValues = {
    hex: itemData.value || "#ff0000",
  };
};

export const hideColorDialog = (state) => {
  state.colorDialog.isOpen = false;
  state.colorDialog.fieldIndex = -1;

  // Reset default values
  state.colorDialog.defaultValues = {
    hex: "#ff0000",
  };
};

export const showTypographyDialog = (
  state,
  { fieldIndex, itemData, colorOptions, fontOptions },
) => {
  state.typographyDialog.isOpen = true;
  state.typographyDialog.fieldIndex = fieldIndex;

  // Update default values with current item data
  state.typographyDialog.defaultValues = {
    fontSize: itemData.fontSize || "16",
    fontColor: itemData.fontColor || "",
    fontStyle: itemData.fontStyle || "",
    fontWeight: itemData.fontWeight || "normal",
    previewText: itemData.previewText || "",
  };

  // Update dropdown options dynamically
  if (colorOptions) {
    state.typographyDialog.form.fields.find(
      (field) => field.name === "fontColor",
    ).options = colorOptions;
  }
  if (fontOptions) {
    state.typographyDialog.form.fields.find(
      (field) => field.name === "fontStyle",
    ).options = fontOptions;
  }
};

export const hideTypographyDialog = (state) => {
  state.typographyDialog.isOpen = false;
  state.typographyDialog.fieldIndex = -1;

  // Reset default values
  state.typographyDialog.defaultValues = {
    fontSize: "16",
    fontColor: "",
    fontStyle: "",
    fontWeight: "normal",
    previewText: "",
  };
};

export const showImageSelectorDialog = (
  state,
  { fieldIndex, groups, currentValue },
) => {
  state.imageSelectorDialog.isOpen = true;
  state.imageSelectorDialog.fieldIndex = fieldIndex;
  state.imageSelectorDialog.groups = groups || [];
  state.imageSelectorDialog.selectedImageId = currentValue || null;
};

export const hideImageSelectorDialog = (state) => {
  state.imageSelectorDialog.isOpen = false;
  state.imageSelectorDialog.fieldIndex = -1;
  state.imageSelectorDialog.groups = [];
  state.imageSelectorDialog.selectedImageId = null;
};

export const setTempSelectedImageId = (state, { imageId }) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const toViewData = ({ state, props }) => {
  const hasContent = props.fields && props.fields.length > 0;
  let visibleFields = props.fields
    ? props.fields.filter((field) => field.show !== false)
    : [];

  // Convert imageId to fileId for image-selector fields
  if (props.images) {
    const flatImages = toFlatItems(props.images);
    visibleFields = visibleFields.map((field) => {
      if (field.type === "image-selector" && field.value) {
        const imageItem = flatImages.find((img) => img.id === field.value);
        return {
          ...field,
          fileId: imageItem ? imageItem.fileId : null,
        };
      }
      return field;
    });
  }

  // Find the first text field index
  let firstTextIndex = -1;
  for (let i = 0; i < visibleFields.length; i++) {
    if (visibleFields[i].type === "text") {
      firstTextIndex = i;
      break;
    }
  }

  // Only create form configuration when popover is open
  const renameForm = state.popover.isOpen
    ? {
        fields: [
          {
            name: "name",
            inputType: "inputText",
            label: "Name",
            value: "", // Always start with empty value
            required: true,
          },
        ],
        actions: {
          layout: "",
          buttons: [
            {
              id: "submit",
              variant: "pr",
              content: "Rename",
            },
          ],
        },
      }
    : null;

  return {
    title: props.title || "",
    visibleFields,
    hasContent,
    emptyMessage: props.emptyMessage || "No selection",
    popover: state.popover,
    form: {
      fields: state.popover.fields,
      actions: state.popover.actions,
    },
    firstTextIndex,
    colorDialog: {
      isOpen: state.colorDialog.isOpen,
      defaultValues: state.colorDialog.defaultValues,
      form: state.colorDialog.form,
    },
    typographyDialog: {
      isOpen: state.typographyDialog.isOpen,
      defaultValues: state.typographyDialog.defaultValues,
      form: state.typographyDialog.form,
    },
    imageSelectorDialog: {
      isOpen: state.imageSelectorDialog.isOpen,
      groups: state.imageSelectorDialog.groups,
      selectedImageId: state.imageSelectorDialog.selectedImageId,
    },
  };
};
