export const handleAfterMount = async (deps) => {
  const { store, drenderer, getRefIds } = deps;
  const { canvas } = getRefIds();
  if (canvas && canvas.elm && !store.selectIsDrendererInitialized()) {
    await drenderer.init({
      canvas: canvas.elm,
    });
    store.setDrendererInitialized(true);
  }
};

// Constants for preview rendering (used in handleReplayAnimation)
const resetState = {
  elements: [
    {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      fill: "#4a4a4a",
    },
  ],
  transitions: [],
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleAnimationItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("animation-item-", "");

  // Forward animation item selection to parent
  dispatchEvent(
    new CustomEvent("animation-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddAnimationClick = async (e, deps) => {
  const { store, render, drenderer } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-animation-button-", "");
  store.setTargetGroupId(groupId);

  // Open dialog for adding
  store.openDialog();
  drenderer.render(resetState);
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Close dialog
  store.closeDialog();
  render();
};

export const handleClosePopover = (e, deps) => {
  const { store, render } = deps;
  store.closePopover();
  render();
};

export const handleAnimationItemDoubleClick = async (e, deps) => {
  const { store, render, props, drenderer } = deps;
  const itemId = e.currentTarget.id.replace("animation-item-", "");

  // Find the animation item data from props.flatGroups
  let itemData = null;
  for (const group of props.flatGroups || []) {
    const foundItem = group.children?.find((child) => child.id === itemId);
    if (foundItem) {
      itemData = { ...foundItem, parent: group.id };
      break;
    }
  }

  if (itemData) {
    // Open dialog for editing
    drenderer.render(resetState);
    store.openDialog({ editMode: true, itemId, itemData });
    render();
  }
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = e.detail.formValues;

    // Get form state using selector
    const formState = store.selectFormState();
    const { targetGroupId, editItemId, editMode, properties } =
      formState;

    if (editMode && editItemId) {
      // Edit mode - dispatch animation update
      dispatchEvent(
        new CustomEvent("animation-updated", {
          detail: {
            itemId: editItemId,
            name: formData.name,
            properties,
          },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      // Add mode - dispatch animation creation
      dispatchEvent(
        new CustomEvent("animation-created", {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            properties,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog
    store.closeDialog();
    render();
  }
};

export const handleAddPropertiesClick = (e, deps) => {
  const { store, render } = deps;

  store.setPopover({
    mode: "addProperty",
    x: e.clientX,
    y: e.clientY,
  });

  render();
};

export const handleAddPropertyFormSubmit = (e, deps) => {
  const { store, render } = deps;
  const { property, initialValue, valueSource } = e.detail.formValues;

  // Get default value for the property if using existing value
  const defaultValues = {
    x: 960,
    y: 540,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };

  const finalInitialValue =
    valueSource === "default"
      ? defaultValues[property] !== undefined
        ? defaultValues[property]
        : 0
      : initialValue;

  store.addProperty({ property, initialValue: finalInitialValue });
  store.closePopover();
  render();
};

export const handleInitialValueChange = (e, deps) => {
  const { store, render } = deps;
  const value = e.detail.value;

  store.setInitialValue(value);
  render();
};

export const handleAddKeyframeInDialog = (e, deps) => {
  const { store, render } = deps;

  // store.showAddKeyframeForm();
  store.setPopover({
    mode: "addKeyframe",
    x: e.detail.x,
    y: e.detail.y,
    payload: {
      property: e.detail.property,
    },
  });

  render();
};

export const handleAddKeyframeFormSubmit = (e, deps) => {
  const { store, render } = deps;
  const {
    payload: { property, index },
  } = store.selectPopover();

  store.addKeyframe({
    ...e.detail.formValues,
    property,
    index,
  });
  store.closePopover();
  render();
};

export const handleKeyframeRightClick = (e, deps) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "keyframeMenu",
    x: e.detail.x,
    y: e.detail.y,
    payload: {
      property: e.detail.property,
      index: e.detail.index,
    },
  });
  render();
};

export const handlePropertyNameRightClick = (e, deps) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "propertyNameMenu",
    x: e.detail.x,
    y: e.detail.y,
    payload: {
      property: e.detail.property,
    },
  });
  render();
};

export const handleKeyframeDropdownItemClick = (e, deps) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const { property, index } = popover.payload;
  // Use the stored x, y coordinates from popover state
  const { x, y } = popover;

  // e.detail.index
  if (e.detail.item.value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index,
      },
    });
  } else if (e.detail.item.value === "delete-property") {
    store.deleteProperty({ property });
    store.closePopover();
  } else if (e.detail.item.value === "delete-keyframe") {
    store.deleteKeyframe({ property, index });
    store.closePopover();
  } else if (e.detail.item.value === "add-right") {
    store.setPopover({
      mode: "addKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index: index + 1,
      },
    });
  } else if (e.detail.item.value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index,
      },
    });
  } else if (e.detail.item.value === "move-right") {
    store.moveKeyframeRight({ property, index });
    store.closePopover();
  } else if (e.detail.item.value === "move-left") {
    store.moveKeyframeLeft({ property, index });
    store.closePopover();
  }

  render();
};

export const handleEditKeyframeFormSubmit = (e, deps) => {
  const { store, render } = deps;
  const {
    payload: { property, index },
  } = store.selectPopover();
  store.updateKeyframe({
    keyframe: e.detail.formValues,
    index,
    property,
  });
  store.closePopover();
  render();
};

export const handleInitialValueClick = (e, deps) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editInitialValue",
    x: e.detail.x,
    y: e.detail.y,
    payload: {
      property: e.detail.property,
    },
  });
  render();
};

export const handleAddPropertyFormChange = (e, deps) => {
  const { store, render } = deps;

  // Form-change event passes individual field changes
  const { name, fieldValue } = e.detail;

  // Get current form values and update the changed field
  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };
  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleEditInitialValueFormChange = (e, deps) => {
  const { store, render } = deps;

  // Form-change event passes individual field changes
  const { name, fieldValue } = e.detail;

  // Get current form values and update the changed field
  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };

  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleReplayAnimation = async (e, deps) => {
  const { store, drenderer } = deps;

  if (!store.selectIsDrendererInitialized()) {
    return;
  }

  await drenderer.render(resetState);

  // Then render with the element and animations after a small delay
  // The 'add' event will trigger the animation
  setTimeout(() => {
    const renderState = store.selectAnimationRenderStateWithAnimations(); // Use selector with animations
    drenderer.render(renderState);
  }, 100);
};

export const handleEditInitialValueFormSubmit = (e, deps) => {
  const { store, render } = deps;
  const {
    payload: { property },
  } = store.selectPopover();

  const { initialValue, valueSource } = e.detail.formValues;

  // Get default value for the property if using existing value
  const defaultValues = {
    x: 960,
    y: 540,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };

  const finalInitialValue =
    valueSource === "default"
      ? defaultValues[property] !== undefined
        ? defaultValues[property]
        : 0
      : initialValue;

  store.updateInitialValue({
    property,
    initialValue: finalInitialValue,
  });
  store.closePopover();
  render();
};
