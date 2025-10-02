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

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const repositoryState = repository.getState();
  const { animations } = repositoryState;

  const animationData = animations || { tree: [], items: {} };

  store.setItems(animationData);
  render();
};

export const handleAnimationItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleAnimationCreated = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, properties } = payload._event.detail;

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

export const handleAnimationUpdated = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, name, properties } = payload._event.detail;

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

export const handleFormChange = async (deps, payload) => {
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
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { animations } = repository.getState();
  store.setItems(animations);
  render();
};

// Handlers forwarded from groupResourcesView
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { store, render, drenderer } = deps;
  const { groupId } = payload._event.detail;
  store.setTargetGroupId(groupId);
  store.openDialog();
  drenderer.render(resetState);
  render();
};

export const handleAnimationItemDoubleClick = async (deps, payload) => {
  const { store, render, drenderer } = deps;
  const { itemId } = payload._event.detail;

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
export const handleCloseDialog = (deps) => {
  const { store, render } = deps;
  store.closeDialog();
  render();
};

export const handleClosePopover = (deps) => {
  const { store, render } = deps;
  store.closePopover();
  render();
};

export const handleFormActionClick = (deps, payload) => {
  const { store, render } = deps;

  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    const formData = payload._event.detail.formValues;
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

export const handleAddPropertiesClick = (deps, payload) => {
  const { store, render } = deps;

  store.setPopover({
    mode: "addProperty",
    x: payload._event.clientX,
    y: payload._event.clientY,
  });

  render();
};

export const handleAddPropertyFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const { property, initialValue, useInitialValue } =
    payload._event.detail.formValues;

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

export const handleAddKeyframeInDialog = (deps, payload) => {
  const { store, render } = deps;

  store.setPopover({
    mode: "addKeyframe",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
    },
  });

  render();
};

export const handleAddKeyframeFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const {
    payload: { property, index },
  } = store.selectPopover();

  store.addKeyframe({
    ...payload._event.detail.formValues,
    property,
    index,
  });
  store.closePopover();
  render();
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "keyframeMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
      index: payload._event.detail.index,
    },
  });
  render();
};

export const handlePropertyNameRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "propertyNameMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleKeyframeDropdownItemClick = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const { property, index } = popover.payload;
  const { x, y } = popover;

  if (payload._event.detail.item.value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index,
      },
    });
  } else if (payload._event.detail.item.value === "delete-property") {
    store.deleteProperty({ property });
    store.closePopover();
  } else if (payload._event.detail.item.value === "delete-keyframe") {
    store.deleteKeyframe({ property, index });
    store.closePopover();
  } else if (payload._event.detail.item.value === "add-right") {
    store.setPopover({
      mode: "addKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index: index + 1,
      },
    });
  } else if (payload._event.detail.item.value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index,
      },
    });
  } else if (payload._event.detail.item.value === "move-right") {
    store.moveKeyframeRight({ property, index });
    store.closePopover();
  } else if (payload._event.detail.item.value === "move-left") {
    store.moveKeyframeLeft({ property, index });
    store.closePopover();
  }

  render();
};

export const handleEditKeyframeFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const {
    payload: { property, index },
  } = store.selectPopover();
  store.updateKeyframe({
    keyframe: payload._event.detail.formValues,
    index,
    property,
  });
  store.closePopover();
  render();
};

export const handleInitialValueClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editInitialValue",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleAddPropertyFormChange = (deps, payload) => {
  const { store, render } = deps;

  const { name, fieldValue } = payload._event.detail;

  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };
  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleEditInitialValueFormChange = (deps, payload) => {
  const { store, render } = deps;

  const { name, fieldValue } = payload._event.detail;

  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };

  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleReplayAnimation = async (deps) => {
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

export const handleEditInitialValueFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const {
    payload: { property },
  } = store.selectPopover();

  const { initialValue, valueSource } = payload._event.detail.formValues;

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
