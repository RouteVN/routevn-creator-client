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
  };
};