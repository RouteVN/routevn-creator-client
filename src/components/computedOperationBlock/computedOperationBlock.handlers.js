const dispatchOperationEvent = (deps, type, detail) => {
  deps.dispatchEvent(
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleOperationContextMenu = (deps, payload) => {
  const { props } = deps;
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();

  dispatchOperationEvent(deps, "operation-contextmenu", {
    operationPath: props.operation?.operationPath ?? [],
    x: event.clientX,
    y: event.clientY,
  });
};

export const handleAddOperandClick = (deps, payload) => {
  payload._event.stopPropagation();
  const rect = payload._event.currentTarget.getBoundingClientRect();

  dispatchOperationEvent(deps, "add-operand-click", {
    operationPath: deps.props.operation?.operationPath ?? [],
    x: rect.left,
    y: rect.bottom,
  });
};

export const handleRemoveOperandClick = (deps, payload) => {
  payload._event.stopPropagation();

  dispatchOperationEvent(deps, "remove-operand-click", {
    operationPath: deps.props.operation?.operationPath ?? [],
    index: Number(payload._event.currentTarget.dataset.index),
  });
};
