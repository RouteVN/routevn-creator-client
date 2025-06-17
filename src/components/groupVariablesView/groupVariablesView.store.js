export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  
  defaultValues: {
    name: '',
    type: 'string',
    default: '',
    readonly: false,
  },

  form: {
    title: 'Add Variable',
    description: 'Create a new variable',
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Name',
      description: 'Enter the variable name',
      required: true,
    }, {
      id: 'type',
      fieldName: 'type',
      inputType: 'inputText',
      label: 'Type',
      description: 'Enter the variable type (e.g., string, number, boolean)',
      required: true,
    }, {
      id: 'default',
      fieldName: 'default',
      inputType: 'inputText',
      label: 'Default Value',
      description: 'Enter the default value for this variable',
      required: false,
    }, {
      id: 'readonly',
      fieldName: 'readonly',
      inputType: 'inputCheckbox',
      label: 'Read Only',
      description: 'Check if this variable should be read-only',
      required: false,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Add Variable',
      }],
    }
  }
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
}

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
}

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
}

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;
  
  console.log("🔧 Variables groupView props.flatGroups:", props.flatGroups);
  
  // Apply collapsed state to flatGroups and create table data
  const flatGroups = (props.flatGroups || []).map(group => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children || []);
    
    console.log(`🔧 Group ${group.id} (${group.fullLabel}):`, {
      isCollapsed,
      hasChildren: group.hasChildren,
      childrenCount: children.length,
      children
    });
    
    // Create table data for this group's variables - using the original format
    const tableData = {
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'default', label: 'Default Value' },
        { key: 'readOnly', label: 'Read Only' }
      ],
      rows: children.length > 0 ? children.map(item => ({
        id: item.id,
        name: item.name,
        type: item.variableType || 'string',
        default: item.defaultValue || '',
        readOnly: item.readonly ? 'Yes' : 'No'
      })) : []
    };

    console.log(`🔧 TableData for group ${group.id}:`, tableData);

    return {
      ...group,
      isCollapsed,
      children,
      tableData
    };
  });

  const result = {
    group1: flatGroups[0].tableData,
    flatGroups,
    selectedItemId: props.selectedItemId,
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
  };
  
  console.log("🔧 Variables groupView returning:", result);
  
  return result;
};