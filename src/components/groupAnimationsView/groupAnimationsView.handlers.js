import { nanoid } from "nanoid";

// Constants for preview rendering
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const BG_COLOR = "#4a4a4a";
const PREVIEW_RECT_WIDTH = 200;
const PREVIEW_RECT_HEIGHT = 200;

// Helper to create render state with animations
const createAnimationRenderState = (
  animationProperties,
  includeAnimations = true,
) => {
  const elements = [
    {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fill: BG_COLOR,
    },
    {
      id: "preview-element",
      type: "rect",
      x: CANVAS_WIDTH / 2, // 960 - center position with anchor 0.5
      y: CANVAS_HEIGHT / 2, // 540 - center position with anchor 0.5
      width: PREVIEW_RECT_WIDTH,
      height: PREVIEW_RECT_HEIGHT,
      fill: "white",
      anchorX: 0.5,
      anchorY: 0.5,
    },
  ];

  // Build transitions array from animation properties
  const transitions = [];
  if (
    includeAnimations &&
    animationProperties &&
    Object.keys(animationProperties).length > 0
  ) {
    // Convert our animation properties to the correct format
    const formattedAnimationProperties = {};

    for (const [property, config] of Object.entries(animationProperties)) {
      if (config.keyframes && config.keyframes.length > 0) {
        // Map property names to route-graphics format
        let propName = property;
        if (property === "scaleX") propName = "scale.x";
        else if (property === "scaleY") propName = "scale.y";

        // Get default values based on property
        let defaultValue = 0;
        if (property === "x") defaultValue = 960;
        else if (property === "y") defaultValue = 540;
        else if (property === "rotation") defaultValue = 0;
        else if (property === "alpha") defaultValue = 1;
        else if (property === "scaleX" || property === "scaleY")
          defaultValue = 1;

        // Parse initial value, use default if not set or invalid
        const initialValue =
          config.initialValue !== undefined && config.initialValue !== ""
            ? parseFloat(config.initialValue)
            : defaultValue;

        // Convert rotation from degrees to radians
        let processedInitialValue = isNaN(initialValue)
          ? defaultValue
          : initialValue;
        if (property === "rotation") {
          processedInitialValue = (processedInitialValue * Math.PI) / 180;
        }

        formattedAnimationProperties[propName] = {
          initialValue: processedInitialValue,
          keyframes: config.keyframes.map((kf) => {
            let value = parseFloat(kf.value) || 0;
            // Convert rotation keyframe values from degrees to radians
            if (property === "rotation") {
              value = (value * Math.PI) / 180;
            }

            return {
              // Parse duration to milliseconds (remove 'ms' or 's' suffix)
              duration:
                kf.duration.includes("s") && !kf.duration.includes("ms")
                  ? parseFloat(kf.duration) * 1000
                  : parseFloat(kf.duration) || 1000,
              value: value,
              easing: kf.easing || "linear",
              relative: kf.relative === true,
            };
          }),
        };
      }
    }

    if (Object.keys(formattedAnimationProperties).length > 0) {
      transitions.push({
        id: "animation-preview",
        elementId: "preview-element",
        type: "keyframes",
        event: "add",
        animationProperties: formattedAnimationProperties,
      });
    }
  }

  return {
    elements,
    transitions,
  };
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
  const { store, render, drenderer, getRefIds } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-animation-button-", "");
  store.setTargetGroupId(groupId);

  // Open dialog for adding
  store.openDialog();
  render();

  // Initialize drenderer after dialog is opened and canvas is in DOM
  const { canvas } = getRefIds();
  if (canvas && canvas.elm && !drenderer.initialized) {
    await drenderer.init({
      canvas: canvas.elm,
    });
    drenderer.initialized = true;

    // Render initial preview state WITHOUT animations
    const renderState = createAnimationRenderState({}, false);
    drenderer.render(renderState);
  }
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
  const { store, render, props, drenderer, getRefIds } = deps;
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
    store.openDialog({ editMode: true, itemId, itemData });
    render();

    // Initialize drenderer after dialog is opened and canvas is in DOM
    const { canvas } = getRefIds();
    if (canvas && canvas.elm) {
      await drenderer.init({
        canvas: canvas.elm,
      });
      drenderer.initialized = true;

      // Render initial preview WITHOUT animations (static preview)
      const animationProperties = itemData.animationProperties || {};
      const renderState = createAnimationRenderState(
        animationProperties,
        false,
      );
      drenderer.render(renderState);
    }
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
    const { targetGroupId, editItemId, editMode, animationProperties } =
      formState;

    if (editMode && editItemId) {
      // Edit mode - dispatch animation update
      dispatchEvent(
        new CustomEvent("animation-updated", {
          detail: {
            itemId: editItemId,
            name: formData.name,
            animationProperties,
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
            animationProperties,
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
  const { store, render, drenderer } = deps;
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

  // Update preview
  if (drenderer.initialized) {
    const formState = store.selectFormState();
    const animationProperties = formState.animationProperties || {};
    const renderState = createAnimationRenderState(animationProperties, false);
    drenderer.render(renderState);
  }
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
  const { store, render, drenderer } = deps;
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

  // Update preview
  if (drenderer.initialized) {
    const formState = store.selectFormState();
    const animationProperties = formState.animationProperties || {};
    const renderState = createAnimationRenderState(animationProperties, false);
    drenderer.render(renderState);
  }
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
  const { render, store, drenderer } = deps;

  console.log("e.detail", e.detail);
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
    // Update preview after deleting property
    if (drenderer.initialized) {
      const formState = store.selectFormState();
      const animationProperties = formState.animationProperties || {};
      const renderState = createAnimationRenderState(
        animationProperties,
        false,
      );
      drenderer.render(renderState);
    }
  } else if (e.detail.item.value === "delete-keyframe") {
    store.deleteKeyframe({ property, index });
    store.closePopover();
    // Update preview after deleting keyframe
    if (drenderer.initialized) {
      const formState = store.selectFormState();
      const animationProperties = formState.animationProperties || {};
      const renderState = createAnimationRenderState(
        animationProperties,
        false,
      );
      drenderer.render(renderState);
    }
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
    // Update preview after moving keyframe
    if (drenderer.initialized) {
      const formState = store.selectFormState();
      const animationProperties = formState.animationProperties || {};
      const renderState = createAnimationRenderState(
        animationProperties,
        false,
      );
      drenderer.render(renderState);
    }
  } else if (e.detail.item.value === "move-left") {
    store.moveKeyframeLeft({ property, index });
    store.closePopover();
    // Update preview after moving keyframe
    if (drenderer.initialized) {
      const formState = store.selectFormState();
      const animationProperties = formState.animationProperties || {};
      const renderState = createAnimationRenderState(
        animationProperties,
        false,
      );
      drenderer.render(renderState);
    }
  }

  render();
};

export const handleEditKeyframeFormSubmit = (e, deps) => {
  const { store, render, drenderer } = deps;
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

  // Update preview
  if (drenderer.initialized) {
    const formState = store.selectFormState();
    const animationProperties = formState.animationProperties || {};
    const renderState = createAnimationRenderState(animationProperties, false);
    drenderer.render(renderState);
  }
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

  console.log("[AddProperty Form Change] Field:", name, "Value:", fieldValue);

  // Get current form values and update the changed field
  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };

  console.log(
    "[AddProperty Form Change] Updated FormValues:",
    updatedFormValues,
  );
  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleEditInitialValueFormChange = (e, deps) => {
  const { store, render } = deps;

  // Form-change event passes individual field changes
  const { name, fieldValue } = e.detail;

  console.log(
    "[EditInitialValue Form Change] Field:",
    name,
    "Value:",
    fieldValue,
  );

  // Get current form values and update the changed field
  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };

  console.log(
    "[EditInitialValue Form Change] Updated FormValues:",
    updatedFormValues,
  );
  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleReplayAnimation = async (e, deps) => {
  console.log("[REPLAY] Handler called");
  const { store, drenderer } = deps;

  if (!drenderer.initialized) {
    console.log("[REPLAY] drenderer not initialized, returning");
    return;
  }

  // Get current animation properties
  const formState = store.selectFormState();
  const animationProperties = formState.animationProperties || {};
  console.log("[REPLAY] Animation properties:", animationProperties);

  // First render without the preview element to reset
  const resetState = {
    elements: [
      {
        id: "bg",
        type: "rect",
        x: 0,
        y: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        fill: BG_COLOR,
      },
    ],
    transitions: [],
  };

  console.log("[REPLAY] Rendering reset state (removing element)");
  await drenderer.render(resetState);

  // Then render with the element and animations after a small delay
  // The 'add' event will trigger the animation
  setTimeout(() => {
    console.log("[REPLAY] Rendering with animations (adding element back)");
    const renderState = createAnimationRenderState(animationProperties, true); // true = include animations for replay
    console.log("[REPLAY] Render state:", renderState);
    drenderer.render(renderState);
    console.log("[REPLAY] Animation replay triggered");
  }, 100);
};

export const handleEditInitialValueFormSubmit = (e, deps) => {
  const { store, render, drenderer } = deps;
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

  // Update preview
  if (drenderer.initialized) {
    const formState = store.selectFormState();
    const animationProperties = formState.animationProperties || {};
    const renderState = createAnimationRenderState(animationProperties, false);
    drenderer.render(renderState);
  }
};
