export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  store.setValues({
    values: props.values || {},
  });
};

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { typography } = repository.getState();

  // Store raw typography data
  store.setTypographyData(typography || { items: {}, tree: [] });
  render();
};

export const handleOnUpdate = (deps, payload) => {
  const { oldAttrs, newAttrs, newProps } = payload;
  const { store, render } = deps;
  if (oldAttrs.key !== newAttrs.key) {
    store.setValues({
      values: newProps.values || {},
    });
    render();
  }
};

export const handleGroupItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { _event } = payload;
  store.openPopoverForm({
    x: _event.clientX,
    y: _event.clientY,
    name: _event.currentTarget.dataset.name,
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
  const { render, store, globalUI, getRefIds } = deps;
  const { _event } = payload;
  const id = _event.currentTarget.dataset.id;

  if (id === "actions") {
    const systemActions = getRefIds()["system-actions"];
    systemActions.elm.transformedHandlers.open({
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
    const result = await globalUI.showDropdownMenu({
      items,
      x: _event.clientX,
      y: _event.clientY,
      placement: "bottom-start",
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

export const handleSystemActionsClose = (deps) => {
  const { render, store } = deps;
  store.closeActionsDialog();
  render();
};

export const handleFormActions = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();
  store.updateValueProperty({
    name,
    value: _event.detail.formValues.value,
  });

  store.closePopoverForm();
  render();

  const formValues = store.selectValues();
  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name,
        value: Number(_event.detail.formValues.value),
      },
    }),
  );
};

export const handleActionsChange = (deps, payload) => {
  const { store, render } = deps;
  store.updateValueProperty({
    name: "actions",
    value: {
      ...store.selectValues().actions,
      ...payload._event.detail,
    },
  });

  render();

  const formValues = store.selectValues();
  dispatchEvent(
    new CustomEvent("update", {
      detail: {
        formValues,
        name: "actions",
        value: {
          ...store.selectValues().actions,
          ...payload._event.detail,
        },
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

export const handleListBarItemRightClick = async (deps, payload) => {
  const { render, store, globalUI } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const { name } = event.currentTarget.dataset;
  const result = await globalUI.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    placement: "bottom-start",
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
  const { render, getRefIds } = deps;
  const { _event: event } = payload;
  const systemActions = getRefIds()["system-actions"];
  const { id } = event.currentTarget.dataset;
  systemActions.elm.transformedHandlers.open({
    mode: id,
  });
  render();
};

export const handleListItemRightClick = async (deps, payload) => {
  const { render, store, globalUI } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const id = event.currentTarget.dataset.id;
  const result = await globalUI.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    placement: "bottom-start",
  });
  if (!result) {
    return;
  }
  const { item } = result;
  if (item.key === "remove") {
    delete actions[id];
    const actions = structuredClone(store.selectValues().actions);
    store.updateValueProperty({
      name: "actions",
      value: actions,
    });
    const formValues = store.selectValues();
    dispatchEvent(
      new CustomEvent("update", {
        detail: {
          formValues,
          name: "actions",
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
