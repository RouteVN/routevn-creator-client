const normalizeValue = (value) => {
  if (value === undefined || value === null || value === true) {
    return "";
  }

  return String(value);
};

const focusInput = (refs) => {
  setTimeout(() => {
    refs.input.focus();
    refs.input.shadowRoot?.querySelector("input")?.focus();
  }, 50);
};

const openValuePopover = (deps, event) => {
  const { props, refs, render, store } = deps;
  if (props.disabled) {
    return;
  }

  const value = normalizeValue(props.value);
  const rect = event.currentTarget.getBoundingClientRect();
  store.setValue({ value });
  store.setTempValue({ value });
  store.openPopover({
    position: {
      x: rect.left,
      y: rect.bottom,
    },
  });
  render();
  focusInput(refs);
};

const commitValue = (deps) => {
  const { dispatchEvent, render, store } = deps;
  const value = normalizeValue(store.selectTempValue());
  store.setValue({ value });
  store.closePopover({});
  dispatchEvent(
    new CustomEvent("value-change", {
      detail: { value },
      bubbles: true,
      composed: true,
    }),
  );
  render();
};

export const handleBeforeMount = ({ props, store }) => {
  const value = normalizeValue(props.value);
  store.setValue({ value });
  store.setTempValue({ value });
};

export const handleOnUpdate = (deps, { oldProps, newProps } = {}) => {
  if (oldProps?.value === newProps?.value) {
    return;
  }

  const { render, store } = deps;
  const value = normalizeValue(newProps?.value);
  store.setValue({ value });
  store.setTempValue({ value });
  render();
};

export const handleTriggerClick = (deps, payload) => {
  openValuePopover(deps, payload._event);
};

export const handleTriggerKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  openValuePopover(deps, event);
};

export const handlePopoverClose = ({ render, store }) => {
  store.closePopover({});
  render();
};

export const handleInputChange = ({ store }, payload) => {
  store.setTempValue({
    value: normalizeValue(payload._event.detail.value),
  });
};

export const handleSubmitClick = (deps) => {
  commitValue(deps);
};

export const handleInputKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    commitValue(deps);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    deps.store.closePopover({});
    deps.render();
  }
};
