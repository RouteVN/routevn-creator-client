import { nanoid } from "nanoid";

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

export const handleAddAnimationClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-animation-button-", "");
  store.setTargetGroupId(groupId);

  // Toggle dialog open
  store.setEditMode(false);
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Close dialog and reset to add mode
  store.setEditMode(false);
  store.toggleDialog();
  render();
};

export const handleClosePopover = (e, deps) => {
  const { store, render } = deps;
  store.closePopover();
  render();
};

export const handleAnimationItemDoubleClick = (e, deps) => {
  const { store, render, props } = deps;
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
    // Set up the form for editing
    store.setEditMode({ editMode: true, itemId, itemData });
    store.toggleDialog();
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

    // Get the target group ID from store - access the internal state properly
    const storeState = store.getState
      ? store.getState()
      : store._state || store.state;
    const targetGroupId = storeState.targetGroupId;
    const editItemId = storeState.editItemId;

    if (storeState.editMode && storeState.editItemId) {
      // Edit mode - dispatch animation update
      dispatchEvent(
        new CustomEvent("animation-updated", {
          detail: {
            itemId: editItemId,
            name: formData.name,
            animationProperties: storeState.animationProperties,
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
            animationProperties: storeState.animationProperties,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog and reset everything
    store.toggleDialog();
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
  const { property, initialValue } = e.detail.formValues;
  store.addProperty({ property, initialValue });
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

  console.log("e.detail", e.detail);
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

  console.log("e.detail.formValues", e.detail.formValues);
  store.addKeyframe({
    ...e.detail.formValues,
    property,
    index,
  });
  store.closePopover();
  render();
};

export const handleKeyframeRightClick = (e, deps) => {
  console.log("xxxxxxxxxxxxxxxxxxx", e.detail);
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

  console.log("e.detail", e.detail);
  const popover = store.selectPopover();
  const { property, index } = popover.payload;

  // e.detail.index
  if (e.detail.item.value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x: e.detail.x,
      y: e.detail.y,
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
      x: e.detail.x,
      y: e.detail.y,
      payload: {
        property,
        index: index + 1,
      },
    });
  } else if (e.detail.item.value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x: e.detail.x,
      y: e.detail.y,
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

export const handleEditInitialValueFormSubmit = (e, deps) => {
  const { store, render } = deps;
  const {
    payload: { property },
  } = store.selectPopover();
  store.updateInitialValue({
    property,
    initialValue: e.detail.formValues.initialValue,
  });
  store.closePopover();
  render();
};
