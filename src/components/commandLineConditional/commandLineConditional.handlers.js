export const handleConditionTypeChange = (deps, payload) => {
  const { store, render } = deps;
  const type = payload._event.target.value;

  store.setConditionType(type);
  render();
};

export const handleVariableSelect = (deps, payload) => {
  const { store, render } = deps;
  const variable = payload._event.target.value;

  store.setSelectedVariable(variable);
  render();
};

export const handleOperatorSelect = (deps, payload) => {
  const { store, render } = deps;
  const operator = payload._event.target.value;

  store.setOperator(operator);
  render();
};

export const handleValueInput = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.target.value;

  store.setComparisonValue(value);
  render();
};

export const handleSubmitClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        conditional: {
          conditionType: payload._event.detail.conditionType,
          selectedVariable: payload._event.detail.selectedVariable,
          operator: payload._event.detail.operator,
          comparisonValue: payload._event.detail.comparisonValue,
        },
      },
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
