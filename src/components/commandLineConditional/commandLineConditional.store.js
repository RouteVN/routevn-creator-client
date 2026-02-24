export const createInitialState = () => ({
  conditionType: "variable",
  selectedVariable: "",
  operator: "==",
  comparisonValue: "",
});

export const setConditionType = ({ state }, { type } = {}) => {
  state.conditionType = type;
};

export const setSelectedVariable = ({ state }, { variable } = {}) => {
  state.selectedVariable = variable;
};

export const setOperator = ({ state }, { operator } = {}) => {
  state.operator = operator;
};

export const setComparisonValue = ({ state }, { value } = {}) => {
  state.comparisonValue = value;
};

export const selectViewData = ({ state }) => {
  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Conditional",
    },
  ];

  const conditionTypeOptions = [
    { value: "variable", label: "Variable Check" },
    { value: "flag", label: "Flag Check" },
    { value: "custom", label: "Custom Expression" },
  ];

  const variableOptions = [
    { value: "", label: "Select Variable..." },
    { value: "score", label: "Score" },
    { value: "health", label: "Health" },
    { value: "level", label: "Level" },
  ];

  const operatorOptions = [
    { value: "==", label: "Equals" },
    { value: "!=", label: "Not Equals" },
    { value: ">", label: "Greater Than" },
    { value: "<", label: "Less Than" },
    { value: ">=", label: "Greater or Equal" },
    { value: "<=", label: "Less or Equal" },
  ];

  return {
    conditionType: state.conditionType,
    selectedVariable: state.selectedVariable,
    operator: state.operator,
    comparisonValue: state.comparisonValue,
    conditionTypeOptions,
    variableOptions,
    operatorOptions,
    breadcrumb,
  };
};
