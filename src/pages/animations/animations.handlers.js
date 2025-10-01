import { nanoid } from "nanoid";

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

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render, drenderer, getRefIds } =
    deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { animations } = repository.getState();
  store.setItems(animations || { tree: [], items: {} });

  // Initialize drenderer if canvas is present
  const { canvas } = getRefIds();
  if (canvas && canvas.elm && !store.selectIsDrendererInitialized()) {
    await drenderer.init({
      canvas: canvas.elm,
    });
    store.setDrendererInitialized(true);
  }

  render();
};

export const handleDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const repositoryState = repository.getState();
  const { animations } = repositoryState;

  const animationData = animations || { tree: [], items: {} };

  store.setItems(animationData);
  render();
};

export const handleAnimationItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleAnimationCreated = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, properties } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "animations",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "animation",
        name: name,
        duration: "4s",
        keyframes: 3,
        properties,
      },
    },
  });

  const { animations } = repository.getState();
  store.setItems(animations);
  render();
};

export const handleAnimationUpdated = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, name, properties } = e.detail;

  repository.addAction({
    actionType: "treeUpdate",
    target: "animations",
    value: {
      id: itemId,
      replace: false,
      item: {
        name: name,
        properties,
      },
    },
  });

  const { animations } = repository.getState();
  store.setItems(animations);
  render();
};

const getInitialValue = (property) => {
  const defaultValues = {
    x: 0,
    y: 0,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };
  return defaultValues[property] || 0;
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "animations",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { animations } = repository.getState();
  store.setItems(animations);
  render();
};

// Handlers forwarded from groupResourcesView
export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (e, deps) => {
  const { store, render } = deps;
  const { groupId } = e.detail;
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleAddAnimationClick = async (e, deps) => {
  const { store, render, drenderer } = deps;
  const { groupId } = e.detail;
  store.setTargetGroupId(groupId);
  store.openDialog();
  drenderer.render(resetState);
  render();
};

export const handleAnimationItemDoubleClick = async (e, deps) => {
  const { store, render, drenderer } = deps;
  const { itemId } = e.detail;

  const animationsData = store.selectAnimationsData();

  if (!animationsData || !animationsData.items) {
    return;
  }

  const itemData = animationsData.items[itemId];

  if (itemData) {
    // Find parent group
    let parent = null;
    for (const [key, value] of Object.entries(animationsData.items)) {
      if (value.children && value.children.includes(itemId)) {
        parent = key;
        break;
      }
    }

    drenderer.render(resetState);
    store.openDialog({
      editMode: true,
      itemId,
      itemData: { ...itemData, parent },
    });
    render();
  }
};

// Dialog handlers
export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;
  store.closeDialog();
  render();
};

export const handleClosePopover = (e, deps) => {
  const { store, render } = deps;
  store.closePopover();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;

  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    const formData = e.detail.formValues;
    const formState = store.selectFormState();
    const { targetGroupId, editItemId, editMode, properties } = formState;

    if (editMode && editItemId) {
      handleAnimationUpdated(
        {
          detail: {
            itemId: editItemId,
            name: formData.name,
            properties,
          },
        },
        deps,
      );
    } else {
      handleAnimationCreated(
        {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            properties,
          },
        },
        deps,
      );
    }

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
  const { property, initialValue, useInitialValue } = e.detail.formValues;

  const defaultValues = {
    x: 960,
    y: 540,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };

  const finalInitialValue = useInitialValue
    ? initialValue !== undefined
      ? initialValue
      : defaultValues[property] !== undefined
        ? defaultValues[property]
        : 0
    : defaultValues[property] !== undefined
      ? defaultValues[property]
      : 0;

  store.addProperty({ property, initialValue: finalInitialValue });
  store.closePopover();
  render();
};

export const handleAddKeyframeInDialog = (e, deps) => {
  const { store, render } = deps;

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
  const { x, y } = popover;

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

  const { name, fieldValue } = e.detail;

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

  const { name, fieldValue } = e.detail;

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

  setTimeout(() => {
    const renderState = store.selectAnimationRenderStateWithAnimations();
    drenderer.render(renderState);
  }, 100);
};

export const handleEditInitialValueFormSubmit = (e, deps) => {
  const { store, render } = deps;
  const {
    payload: { property },
  } = store.selectPopover();

  const { initialValue, valueSource } = e.detail.formValues;

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
