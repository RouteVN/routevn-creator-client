export const INITIAL_STATE = Object.freeze({
  conditionType: 'variable',
  selectedVariable: '',
  operator: '==',
  comparisonValue: ''
});

export const setConditionType = (state, type) => {
  state.conditionType = type;
};

export const setSelectedVariable = (state, variable) => {
  state.selectedVariable = variable;
};

export const setOperator = (state, operator) => {
  state.operator = operator;
};

export const setComparisonValue = (state, value) => {
  state.comparisonValue = value;
};

export const toViewData = ({ state, props }, payload) => {
  return {
    conditionType: state.conditionType,
    selectedVariable: state.selectedVariable,
    operator: state.operator,
    comparisonValue: state.comparisonValue,
  };
};