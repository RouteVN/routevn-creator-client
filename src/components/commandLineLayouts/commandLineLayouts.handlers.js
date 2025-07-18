import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, render, props } = deps;
  const { layouts } = repository.getState();
  store.setItems({
    items: layouts,
  });

  // Initialize with existing layout if available
  if (props?.existingLayout?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.existingLayout.layoutId,
    });
  }
};

export const handleLayoutItemClick = (payload, deps) => {
  const { store, render } = deps;

  // Extract layout ID from the element ID (format: layout-item-{id})
  const elementId =
    payload.target.id || payload.target.closest('[id^="layout-item-"]')?.id;
  const layoutId = elementId?.replace("layout-item-", "");

  store.setTempSelectedLayoutId({
    layoutId: layoutId,
  });

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;

  const selectedLayoutId = store.selectSelectedLayoutId();

  if (!selectedLayoutId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        layout: {
          layoutId: selectedLayoutId,
        },
      },
    }),
  );
};

export const handleLayoutSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  const selectedLayoutId = store.selectSelectedLayoutId();

  store.setTempSelectedLayoutId({
    layoutId: selectedLayoutId,
  });

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};

export const handleBreadcumbLayoutsClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "current",
  });
  render();
};

export const handleButtonSelectClickLayout = (payload, deps) => {
  const { store, render, repository } = deps;

  const tempSelectedLayoutId = store.selectTempSelectedLayoutId();

  store.setSelectedLayoutId({
    layoutId: tempSelectedLayoutId,
  });

  store.setMode({
    mode: "current",
  });
  render();
};
