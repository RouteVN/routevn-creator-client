export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const rawOffset = Number(props?.rollbackByOffset?.offset);
  const offset = Number.isFinite(rawOffset) && rawOffset < 0 ? rawOffset : -1;

  store.setDefaultValues({
    offset,
  });
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { values: formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  store.setDefaultValues(formValues);
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const defaultValues = store.selectDefaultValues();
  const rawOffset = Number(defaultValues.offset);
  const offset = Number.isFinite(rawOffset) && rawOffset < 0 ? rawOffset : -1;

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        rollbackByOffset: {
          offset,
        },
      },
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
