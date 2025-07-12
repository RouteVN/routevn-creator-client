export const INITIAL_STATE = Object.freeze({
  // Popover state for renaming
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
  },
  // Color dialog state
  colorDialog: {
    isOpen: false,
    fieldIndex: -1,
    defaultValues: {
      hex: '#ff0000',
    },
    form: {
      title: 'Edit Color',
      description: 'Edit the color',
      fields: [{
        id: 'hex',
        fieldName: 'hex',
        inputType: 'colorPicker',
        label: 'Hex Value',
        description: 'Enter the hex color value (e.g., #ff0000)',
        required: true,
      }],
      actions: {
        layout: '',
        buttons: [{
          id: 'submit',
          variant: 'pr',
          content: 'Update Color',
        }],
      }
    }
  },
  // Typography dialog state
  typographyDialog: {
    isOpen: false,
    fieldIndex: -1,
    defaultValues: {
      fontSize: '16',
      fontColor: '#000000',
      fontStyle: '',
      fontWeight: 'normal',
    },
    form: {
      title: 'Edit Typography',
      description: 'Edit the typography style',
      fields: [{
        id: 'fontSize',
        fieldName: 'fontSize',
        inputType: 'inputText',
        label: 'Font Size',
        description: 'Enter the font size (e.g., 16, 18, 24)',
        required: true,
      }, {
        id: 'fontColor',
        fieldName: 'fontColor',
        inputType: 'select',
        label: 'Font Color',
        description: 'Select a font color',
        placeholder: 'Choose a color',
        options: [], // Will be populated dynamically
        required: true,
      }, {
        id: 'fontStyle',
        fieldName: 'fontStyle',
        inputType: 'select',
        label: 'Font Style',
        description: 'Select a font style',
        placeholder: 'Choose a font',
        options: [], // Will be populated dynamically
        required: true,
      }, {
        id: 'fontWeight',
        fieldName: 'fontWeight',
        inputType: 'inputText',
        label: 'Font Weight',
        description: 'Enter the font weight (e.g., normal, bold, 400, 700)',
        required: true,
      }],
      actions: {
        layout: '',
        buttons: [{
          id: 'submit',
          variant: 'pr',
          content: 'Update Typography',
        }],
      }
    }
  }
});

export const showPopover = (state, { position }) => {
  state.popover = {
    isOpen: true,
    position,
  };
}

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    position: { x: 0, y: 0 },
  };
}

export const showColorDialog = (state, { fieldIndex, itemData }) => {
  state.colorDialog.isOpen = true;
  state.colorDialog.fieldIndex = fieldIndex;
  
  // Update default values with current item data
  state.colorDialog.defaultValues = {
    hex: itemData.value || '#ff0000',
  };
}

export const hideColorDialog = (state) => {
  state.colorDialog.isOpen = false;
  state.colorDialog.fieldIndex = -1;
  
  // Reset default values
  state.colorDialog.defaultValues = {
    hex: '#ff0000',
  };
}

export const showTypographyDialog = (state, { fieldIndex, itemData, colorOptions, fontOptions }) => {
  state.typographyDialog.isOpen = true;
  state.typographyDialog.fieldIndex = fieldIndex;
  
  // Update default values with current item data
  state.typographyDialog.defaultValues = {
    fontSize: itemData.fontSize || '16',
    fontColor: itemData.fontColor || '#000000',
    fontStyle: itemData.fontStyle || '',
    fontWeight: itemData.fontWeight || 'normal',
  };
  
  // Update dropdown options dynamically
  if (colorOptions) {
    state.typographyDialog.form.fields[1].options = colorOptions;
  }
  if (fontOptions) {
    state.typographyDialog.form.fields[2].options = fontOptions;
  }
}

export const hideTypographyDialog = (state) => {
  state.typographyDialog.isOpen = false;
  state.typographyDialog.fieldIndex = -1;
  
  // Reset default values
  state.typographyDialog.defaultValues = {
    fontSize: '16',
    fontColor: '#000000',
    fontStyle: '',
    fontWeight: 'normal',
  };
}

export const toViewData = ({ state, props }) => {
  const hasContent = props.fields && props.fields.length > 0;
  const visibleFields = props.fields ? props.fields.filter(field => field.show !== false) : [];
  
  // Find the first text field index
  let firstTextIndex = -1;
  for (let i = 0; i < visibleFields.length; i++) {
    if (visibleFields[i].type === 'text') {
      firstTextIndex = i;
      break;
    }
  }
  
  // Only create form configuration when popover is open
  const renameForm = state.popover.isOpen ? {
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Name',
      value: '', // Always start with empty value
      required: true,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Rename',
      }, {
        id: 'cancel',
        variant: 'se',
        content: 'Cancel',
      }],
    }
  } : null;

  return {
    title: props.title || '',
    visibleFields,
    hasContent,
    emptyMessage: props.emptyMessage || 'No selection',
    popover: state.popover,
    form: renameForm,
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
  };
};