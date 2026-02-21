export const handleConditionTypeChange = (deps, payload) => {
  const { store, render } = deps;
  const type = payload._event.detail?.value ?? payload._event.target?.value;

  store.setConditionType({ type: type });
  render();
};

export const handleVariableSelect = (deps, payload) => {
  const { store, render } = deps;
  const variable = payload._event.detail?.value ?? payload._event.target?.value;

  store.setSelectedVariable({ variable: variable });
  render();
};

export const handleOperatorSelect = (deps, payload) => {
  const { store, render } = deps;
  const operator = payload._event.detail?.value ?? payload._event.target?.value;

  store.setOperator({ operator: operator });
  render();
};

export const handleValueInput = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value ?? payload._event.target?.value;

  store.setComparisonValue({ value: value });
  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const state = store.getState();
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        conditional: {
          conditionType: state.conditionType,
          selectedVariable: state.selectedVariable,
          operator: state.operator,
          comparisonValue: state.comparisonValue,
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
