export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const values = props.values || {};
  store.setValues({
    values,
  });
  store.setVariablesData({
    variablesData: props.variablesData || { items: {}, tree: [] },
  });
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;
  await projectService.ensureRepository();
  const { typography } = projectService.getState();

  // Store raw typography data
  store.setTypographyData({
    typographyData: typography || { items: {}, tree: [] },
  });
  render();
};

export const handleOnUpdate = (deps, payload) => {
  const { oldProps, newProps } = payload;
  const { store, render } = deps;
  if (oldProps?.key !== newProps?.key) {
    const values = newProps.values || {};
    store.setValues({
      values,
    });
    store.setVariablesData({
      variablesData: newProps.variablesData || { items: {}, tree: [] },
    });
    render();
  }
};

export const handleGroupItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const popoverForm = store.selectFieldPopoverForm(name);
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
  const { store, render, dispatchEvent } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;

  store.updateValueProperty({
    name: name,
    value: _event.detail.value,
  });

  store.closePopoverForm();

  const formValues = store.selectValues();
  render();

  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name,
        value: _event.detail.value,
      },
    }),
  );
};

export const handleSectionActionClick = async (deps, payload) => {
  const { render, store, appService, refs } = deps;
  const { _event } = payload;
  const id = _event.currentTarget.dataset.id;

  if (id === "actions") {
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
  const { store, render, dispatchEvent } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();
  store.updateValueProperty({
    name,
    value: _event.detail.values.value,
  });

  store.closePopoverForm();
  render();

  const formValues = store.selectValues();
  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name,
        value: _event.detail.values.value,
      },
    }),
  );
};

export const handleActionsChange = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;

  const currentActions =
    store.selectValues().click?.actionPayload?.actions || {};
  const newActions = {
    ...currentActions,
    ...payload._event.detail,
  };

  store.updateValueProperty({
    name: "click.actionPayload.actions",
    value: newActions,
  });

  render();

  const formValues = store.selectValues();
  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name: "click.actionPayload.actions",
        value: newActions,
      },
    }),
  );
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
  const { render, store, appService, dispatchEvent } = deps;
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

  const formValues = store.selectValues();
  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name,
        value: undefined,
      },
    }),
  );
};

// --- List Item ---
export const handleListItemClick = async (deps, payload) => {
  const { render, refs } = deps;
  const { _event: event } = payload;
  const systemActions = refs["systemActions"];
  const { id } = event.currentTarget.dataset;
  systemActions.transformedHandlers.open({
    mode: id,
  });
  render();
};

export const handleListItemRightClick = async (deps, payload) => {
  const { render, store, appService, dispatchEvent } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const id = event.currentTarget.dataset.id;
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
    const currentActions =
      store.selectValues().click?.actionPayload?.actions || {};
    const actions = structuredClone(currentActions);
    delete actions[id];
    store.updateValueProperty({
      name: "click.actionPayload.actions",
      value: actions,
    });
    const formValues = store.selectValues();
    dispatchEvent(
      new CustomEvent("update", {
        bubbles: true,
        detail: {
          formValues,
          name: "click.actionPayload.actions",
          value: actions,
        },
      }),
    );
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
  const { store, render, dispatchEvent } = deps;
  const imageId = store.selectTempSelectedImageId();
  const { name } = store.selectImageSelectorDialog();

  store.updateValueProperty({
    name: name,
    value: imageId,
  });
  store.closeImageSelectorDialog();
  render();

  const formValues = store.selectValues();
  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name: name,
        value: imageId,
      },
    }),
  );
};
