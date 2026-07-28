const submitValue = (deps) => {
  const { dispatchEvent, store } = deps;
  const valueType = store.selectValueType();
  let value = store.selectValue();
  if (valueType === "number") {
    value = Number(value);
  } else if (valueType === "string") {
    value = String(value ?? "");
  } else if (valueType === "boolean") {
    value = value === true || value === "true";
  } else {
    return;
  }
  if (valueType === "number" && !Number.isFinite(value)) {
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
  const { store } = deps;
  const wasOpen = payload.oldProps.open === true;
  const isOpen = payload.newProps.open === true;
  if (wasOpen || !isOpen) {
    return;
  }

  store.resetValue({
    valueTypes: payload.newProps.valueTypes,
    initialValue: payload.newProps.initialValue,
  });
};

export const handleValueInput = (deps, payload) => {
  const { store } = deps;
  const valueType = store.selectValueType();
  const rawValue =
    payload._event.detail?.value ?? payload._event.target?.value ?? "";
  let value = rawValue;
  if (valueType === "boolean") {
    value = rawValue === true || rawValue === "true";
  }
  store.setValue({
    value,
  });
};

export const handleValueTypeChange = (deps, payload) => {
  const { refs, render, store } = deps;
  const valueType =
    payload._event.detail?.value ?? payload._event.target?.value;
  store.setValueType({ valueType });
  render();
  const valueInput =
    valueType === "number"
      ? refs.numberValueInput
      : valueType === "boolean"
        ? refs.booleanValueInput
        : refs.stringValueInput;
  valueInput.focus();
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
