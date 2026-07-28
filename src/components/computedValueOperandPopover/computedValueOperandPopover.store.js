import {
  COMPUTED_LITERAL_TYPES,
  isComputedLiteralValue,
} from "../../internal/computedOperations.js";

export const createInitialState = () => ({
  valueType: "number",
  value: 0,
});

const normalizeValueTypes = (valueTypes) => {
  const normalizedValueTypes = COMPUTED_LITERAL_TYPES.filter((valueType) =>
    valueTypes?.includes(valueType),
  );
  return normalizedValueTypes.length > 0 ? normalizedValueTypes : ["number"];
};

const getDefaultValue = (valueType) => {
  if (valueType === "string") {
    return "";
  }
  if (valueType === "boolean") {
    return false;
  }
  return 0;
};

export const resetValue = ({ state }, { valueTypes, initialValue } = {}) => {
  const normalizedValueTypes = normalizeValueTypes(valueTypes);
  const value = initialValue?.value;
  if (
    isComputedLiteralValue(value) &&
    normalizedValueTypes.includes(typeof value)
  ) {
    state.valueType = typeof value;
    state.value = value;
    return;
  }

  state.valueType = normalizedValueTypes[0];
  state.value = getDefaultValue(state.valueType);
};

export const setValueType = ({ state }, { valueType } = {}) => {
  if (!COMPUTED_LITERAL_TYPES.includes(valueType)) {
    return;
  }
  state.valueType = valueType;
  state.value = getDefaultValue(valueType);
};

export const setValue = ({ state }, { value } = {}) => {
  state.value = value;
};

export const selectValue = ({ state }) => state.value;
export const selectValueType = ({ state }) => state.valueType;

export const selectViewData = ({ i18n, props, state }) => {
  const copy = i18n?.variablesPage ?? {};
  const valueTypes = normalizeValueTypes(props.valueTypes);

  return {
    open: props.open === true,
    x: props.x ?? 0,
    y: props.y ?? 0,
    value: state.value,
    numberValue: state.valueType === "number" ? state.value : 0,
    stringValue: state.valueType === "string" ? state.value : "",
    valueType: state.valueType,
    booleanSelectedValue: state.value === true ? "true" : "false",
    valueTypeLabel: copy.computedValueTypeLabel ?? "Value type",
    valueTypeOptions: valueTypes.map((valueType) => ({
      value: valueType,
      label:
        valueType === "number"
          ? (copy.variableTypeNumberLabel ?? "Number")
          : valueType === "boolean"
            ? (copy.variableTypeBooleanLabel ?? "Boolean")
            : (copy.variableTypeStringLabel ?? "String"),
    })),
    showValueTypeSelect: valueTypes.length > 1,
    valueTypeSelectStyle:
      valueTypes.length > 1 ? "display: flex;" : "display: none;",
    numberInputStyle:
      state.valueType === "number" ? "display: contents;" : "display: none;",
    stringInputStyle:
      state.valueType === "string" ? "display: contents;" : "display: none;",
    booleanInputStyle:
      state.valueType === "boolean" ? "display: contents;" : "display: none;",
    booleanOptions: [
      { value: "true", label: copy.booleanTrueLabel ?? "True" },
      { value: "false", label: copy.booleanFalseLabel ?? "False" },
    ],
    valueLabel: copy.computedNodeValueSource ?? "Value",
    addValueLabel:
      props.initialValue === undefined
        ? (copy.addValueButton ?? "Add Value")
        : (copy.computedUpdateValueButton ?? "Update Value"),
  };
};
