const emitAnchorChange = (deps, index) => {
  const { dispatchEvent, props } = deps;
  const option = props.options?.[index];
  if (!option) {
    return;
  }

  dispatchEvent(
    new CustomEvent("value-change", {
      bubbles: true,
      composed: true,
      detail: {
        item: option,
        value: option.value,
      },
    }),
  );
};

const getKeyboardTargetIndex = (index, key, optionCount) => {
  const lastIndex = optionCount - 1;
  const column = index % 3;
  const row = Math.floor(index / 3);

  if (key === "ArrowLeft") {
    return column > 0 ? index - 1 : index;
  }
  if (key === "ArrowRight") {
    return column < 2 && index < lastIndex ? index + 1 : index;
  }
  if (key === "ArrowUp") {
    return row > 0 ? index - 3 : index;
  }
  if (key === "ArrowDown") {
    return index + 3 <= lastIndex ? index + 3 : index;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return lastIndex;
  }

  return undefined;
};

export const handleAnchorCellClick = (deps, payload = {}) => {
  const { _event } = payload;
  if (_event.currentTarget.getAttribute("aria-checked") === "true") {
    return;
  }

  emitAnchorChange(deps, Number(_event.currentTarget.dataset.anchorIndex));
};

export const handleAnchorCellKeyDown = (deps, payload = {}) => {
  const { props, refs } = deps;
  const { _event } = payload;
  const currentIndex = Number(_event.currentTarget.dataset.anchorIndex);
  const targetIndex = getKeyboardTargetIndex(
    currentIndex,
    _event.key,
    props.options?.length ?? 0,
  );
  if (targetIndex === undefined) {
    return;
  }

  _event.preventDefault();
  if (targetIndex === currentIndex) {
    return;
  }

  refs.anchorGrid
    .querySelector(`[data-anchor-index="${targetIndex}"]`)
    ?.focus();
  emitAnchorChange(deps, targetIndex);
};
