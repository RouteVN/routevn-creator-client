export const handleConditionTypeChange = (e, deps) => {
  const { store, render } = deps;
  const type = e.target.value;

  store.setConditionType(type);
  render();
};

export const handleVariableSelect = (e, deps) => {
  const { store, render } = deps;
  const variable = e.target.value;

  store.setSelectedVariable(variable);
  render();
};

export const handleOperatorSelect = (e, deps) => {
  const { store, render } = deps;
  const operator = e.target.value;

  store.setOperator(operator);
  render();
};

export const handleValueInput = (e, deps) => {
  const { store, render } = deps;
  const value = e.target.value;

  store.setComparisonValue(value);
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        conditional: {
          conditionType: e?.conditionType,
          selectedVariable: e?.selectedVariable,
          operator: e?.operator,
          comparisonValue: e?.comparisonValue,
        },
      },
    }),
  );
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};
