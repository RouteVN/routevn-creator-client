import {
  getInteractionActions,
  getInteractionPayload,
} from "../../internal/project/interactionPayload.js";

const ACTION_INTERACTION_TYPES = ["click", "rightClick"];
const EMPTY_TREE = { items: {}, tree: [] };

const getInteractionPropertyName = (interactionType) => {
  return ACTION_INTERACTION_TYPES.includes(interactionType)
    ? interactionType
    : "click";
};

const emitPanelUpdate = (
  { dispatchEvent, store },
  { name, value, bubbles = false } = {},
) => {
  dispatchEvent(
    new CustomEvent("update", {
      bubbles,
      detail: {
        formValues: store.selectValues(),
        name,
        value,
      },
    }),
  );
};

const applyPanelValueUpdate = (
  deps,
  { name, value, closePopover = false, closeImageSelector = false } = {},
) => {
  const { store, render } = deps;

  store.updateValueProperty({
    name,
    value,
  });

  if (closePopover) {
    store.closePopoverForm();
  }

  if (closeImageSelector) {
    store.closeImageSelectorDialog();
  }

  render();
  emitPanelUpdate(deps, { name, value });
};

export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const values = props.values || {};
  store.setValues({
    values,
  });
  store.setTextStylesData({
    textStylesData: props.textStylesData || EMPTY_TREE,
  });
  store.setVariablesData({
    variablesData: props.variablesData || EMPTY_TREE,
  });
};

export const handleOnUpdate = (deps, payload) => {
  const { oldProps, newProps } = payload;
  const { store, render } = deps;
  if (
    oldProps?.key === newProps?.key &&
    oldProps?.values === newProps?.values &&
    oldProps?.variablesData === newProps?.variablesData &&
    oldProps?.textStylesData === newProps?.textStylesData
  ) {
    return;
  }

  store.setValues({
    values: newProps.values || {},
  });
  store.setTextStylesData({
    textStylesData: newProps.textStylesData || EMPTY_TREE,
  });
  store.setVariablesData({
    variablesData: newProps.variablesData || EMPTY_TREE,
  });
  render();
};

export const handleGroupItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const popoverForm = store.selectFieldPopoverForm({ name });
  store.openPopoverForm({
    x: _event.clientX,
    y: _event.clientY,
    name,
    form: popoverForm,
  });

  render();
};

export const handlePopverFormClose = (deps) => {
  const { render, store } = deps;
  store.closePopoverForm();
  render();
};

export const handleOptionSelected = (deps, payload) => {
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;

  applyPanelValueUpdate(deps, {
    name,
    value: _event.detail.value,
    closePopover: true,
  });
};

export const handleSectionActionClick = async (deps, payload) => {
  const { render, store, appService, refs } = deps;
  const { _event } = payload;
  const id = _event.currentTarget.dataset.id;

  if (id === "actions") {
    const result = await appService.showDropdownMenu({
      items: [
        { type: "item", label: "Click", key: "click" },
        { type: "item", label: "Right Click", key: "rightClick" },
      ],
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!result) {
      return;
    }

    const { item } = result;
    const interactionType = getInteractionPropertyName(item.key);
    store.setActiveInteractionType({
      interactionType,
    });
    const systemActions = refs["systemActions"];
    systemActions.transformedHandlers.open({
      mode: "actions",
    });
  } else if (id === "images") {
    const items = [];
    const { imageId, hoverImageId, clickImageId } = store.selectValues();
    if (!imageId) {
      items.push({ type: "item", label: "Default", key: "imageId" });
    }
    if (!hoverImageId) {
      items.push({ type: "item", label: "Hover", key: "hoverImageId" });
    }
    if (!clickImageId) {
      items.push({ type: "item", label: "Click", key: "clickImageId" });
    }
    const result = await appService.showDropdownMenu({
      items,
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!result) {
      return;
    }
    const { item } = result;

    if (item.key) {
      store.openImageSelectorDialog({
        name: item.key,
      });
      render();
    }
  }
};

export const handleFormActions = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();
  applyPanelValueUpdate(deps, {
    name,
    value: _event.detail.values.value,
    closePopover: true,
  });
};

export const handleActionsChange = (deps, payload) => {
  const { store, render } = deps;
  const interactionType = store.selectActiveInteractionType();
  const interactionKey = getInteractionPropertyName(interactionType);

  const currentActions = getInteractionActions(
    store.selectValues()[interactionKey],
  );
  const newActions = {
    ...currentActions,
    ...payload._event.detail,
  };
  const currentPayload = getInteractionPayload(
    store.selectValues()[interactionKey],
  );

  store.updateValueProperty({
    name: `${interactionKey}.payload`,
    value: {
      ...currentPayload,
      actions: newActions,
    },
  });

  render();
  emitPanelUpdate(deps, {
    name: `${interactionKey}.payload.actions`,
    value: newActions,
  });
};

export const handleListBarItemClick = async (deps, payload) => {
  const { render, store } = deps;
  const { _event: event } = payload;
  const { name } = event.currentTarget.dataset;
  store.openImageSelectorDialog({
    name,
  });
  render();
};

export const handlePopoverFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { _event } = payload;

  store.updatePopoverFormContext({
    values: _event.detail.values,
  });
  render();
};

export const handleListBarItemRightClick = async (deps, payload) => {
  const { render, store, appService } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const { name } = event.currentTarget.dataset;

  // Prevent removing bar idle image - it's required for slider
  if (name === "barImageId") {
    return;
  }

  const result = await appService.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (!result) {
    return;
  }
  const { item } = result;
  if (item.key === "remove") {
    store.updateValueProperty({
      name,
      value: undefined,
    });

    // Cascade delete for slider images
    // If bar is deleted, also delete thumb and hover images
    if (name === "barImageId") {
      store.updateValueProperty({ name: "thumbImageId", value: undefined });
      store.updateValueProperty({
        name: "hoverBarImageId",
        value: undefined,
      });
      store.updateValueProperty({
        name: "hoverThumbImageId",
        value: undefined,
      });
    }
    // If thumb is deleted, also delete hover thumb
    if (name === "thumbImageId") {
      store.updateValueProperty({
        name: "hoverThumbImageId",
        value: undefined,
      });
    }
  }
  render();
  emitPanelUpdate(deps, {
    name,
    value: undefined,
  });
};

// --- List Item ---
export const handleListItemClick = async (deps, payload) => {
  const { render, refs, store } = deps;
  const { _event: event } = payload;
  const systemActions = refs["systemActions"];
  const { id, interaction } = event.currentTarget.dataset;
  store.setActiveInteractionType({
    interactionType: getInteractionPropertyName(interaction),
  });
  systemActions.transformedHandlers.open({
    mode: id,
  });
  render();
};

export const handleListItemRightClick = async (deps, payload) => {
  const { render, store, appService } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const { id, interaction } = event.currentTarget.dataset;
  const interactionKey = getInteractionPropertyName(interaction);
  const result = await appService.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (!result) {
    return;
  }
  const { item } = result;
  if (item.key === "remove") {
    const currentActions = getInteractionActions(
      store.selectValues()[interactionKey],
    );
    const actions = structuredClone(currentActions);
    const currentPayload = getInteractionPayload(
      store.selectValues()[interactionKey],
    );
    delete actions[id];
    store.updateValueProperty({
      name: `${interactionKey}.payload`,
      value: {
        ...currentPayload,
        actions,
      },
    });
    emitPanelUpdate(deps, {
      name: `${interactionKey}.payload.actions`,
      value: actions,
      bubbles: true,
    });
  }
  render();
};

// --- Image Selector ---
export const handleImageSelectorImageSelected = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  store.setTempSelectedImageId({
    imageId: _event.detail.imageId,
  });
};

export const handleImageSelectorCancel = (deps) => {
  const { store, render } = deps;
  store.closeImageSelectorDialog();
  render();
};

export const handleImageSelectorSubmit = (deps) => {
  const { store } = deps;
  const imageId = store.selectTempSelectedImageId();
  const { name } = store.selectImageSelectorDialog();
  applyPanelValueUpdate(deps, {
    name,
    value: imageId,
    closeImageSelector: true,
  });
};
