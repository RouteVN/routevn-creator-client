export const normalizeVariableEnumValues = (values = []) => {
  const normalizedValues = Array.isArray(values) ? values : [];
  const seen = new Set();
  const result = [];

  for (const value of normalizedValues) {
    const stringValue = String(value ?? "").trim();
    if (!stringValue || seen.has(stringValue)) {
      continue;
    }
    seen.add(stringValue);
    result.push(stringValue);
  }

  return result;
};

export const isVariableEnumEnabled = (variable = {}) =>
  variable?.variableType === "string" && variable?.isEnum === true;

export const buildVariableEnumOptions = (values = []) =>
  normalizeVariableEnumValues(values).map((value) => ({
    value,
    label: value,
  }));
