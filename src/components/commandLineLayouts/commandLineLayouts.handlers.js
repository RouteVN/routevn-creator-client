export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { layouts } = repository.getState();
  store.setItems({
    'items': layouts
  })
}

export const handleLayoutItemClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'current'
  })

  render();
}

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        layout: {
          layoutId: payload?.layoutId,
        }
      },
    }),
  );
}

export const handleLayoutSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "gallery",
  });

  render();
}

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