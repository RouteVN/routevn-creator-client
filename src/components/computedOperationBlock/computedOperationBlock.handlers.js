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
    target: props.operation?.target,
    x: event.clientX,
    y: event.clientY,
  });
};

export const handleAddOperandClick = (deps, payload) => {
  payload._event.stopPropagation();
  const rect = payload._event.currentTarget.getBoundingClientRect();

  dispatchOperationEvent(deps, "add-operand-click", {
    operationPath: deps.props.operation?.operationPath ?? [],
    target: deps.props.operation?.target,
    x: rect.left,
    y: rect.bottom,
  });
};

export const handleRemoveOperandClick = (deps, payload) => {
  payload._event.stopPropagation();

  dispatchOperationEvent(deps, "remove-operand-click", {
    operationPath: deps.props.operation?.operationPath ?? [],
    target: deps.props.operation?.target,
    index: Number(payload._event.currentTarget.dataset.index),
  });
};

export const handleValueOperandClick = (deps, payload) => {
  const event = payload._event;
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.index);
  const operand = deps.props.operation?.operands?.[index];
  if (operand?.source !== "value") {
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();

  dispatchOperationEvent(deps, "value-operand-click", {
    operationPath: deps.props.operation?.operationPath ?? [],
    target: deps.props.operation?.target,
    index,
    value: operand.value,
    x: rect.left,
    y: rect.bottom,
  });
};

export const handleValueOperandContextMenu = (deps, payload) => {
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.index);
  const operand = deps.props.operation?.operands?.[index];
  if (operand?.source !== "value") {
    return;
  }

  dispatchOperationEvent(deps, "value-operand-contextmenu", {
    operationPath: deps.props.operation?.operationPath ?? [],
    target: deps.props.operation?.target,
    index,
    x: event.clientX,
    y: event.clientY,
  });
};

export const handleVariableOperandClick = (deps, payload) => {
  const event = payload._event;
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.index);
  const operand = deps.props.operation?.operands?.[index];
  if (operand?.source !== "variable") {
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();

  dispatchOperationEvent(deps, "variable-operand-click", {
    operationPath: deps.props.operation?.operationPath ?? [],
    target: deps.props.operation?.target,
    index,
    x: rect.left,
    y: rect.bottom,
  });
};

export const handleVariableOperandContextMenu = (deps, payload) => {
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.index);
  const operand = deps.props.operation?.operands?.[index];
  if (operand?.source !== "variable") {
    return;
  }

  dispatchOperationEvent(deps, "variable-operand-contextmenu", {
    operationPath: deps.props.operation?.operationPath ?? [],
    target: deps.props.operation?.target,
    index,
    x: event.clientX,
    y: event.clientY,
  });
};
