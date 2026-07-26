const submitValue = (deps) => {
  const { dispatchEvent, refs, store } = deps;
  const value = Number(refs.valueInput.value);
  if (!Number.isFinite(value)) {
    return;
  }

  store.setValue({ value });
  dispatchEvent(
    new CustomEvent("value-submit", {
      detail: { value },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleOnUpdate = (deps, payload) => {
  const { refs, render, store } = deps;
  const wasOpen = payload.oldProps.open === true;
  const isOpen = payload.newProps.open === true;
  if (wasOpen || !isOpen) {
    return;
  }

  store.resetValue();
  render();
  refs.valueInput.value = 0;
  refs.valueInput.focus();
};

export const handleValueInput = (deps, payload) => {
  const { store } = deps;
  store.setValue({
    value: payload._event.detail.value,
  });
};

export const handleSubmitClick = (deps) => {
  submitValue(deps);
};

export const handleInputKeydown = (deps, payload) => {
  const { dispatchEvent } = deps;
  const event = payload._event;
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    submitValue(deps);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    dispatchEvent(
      new CustomEvent("close", {
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handlePopoverClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("close", {
      bubbles: true,
      composed: true,
    }),
  );
};
