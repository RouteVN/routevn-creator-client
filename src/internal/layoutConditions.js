import { getRuntimeConditionItems } from "./runtimeFields.js";

export const SAVE_DATA_AVAILABLE_CONDITION_TARGET = "item.savedAt";
export const LINE_COMPLETED_CONDITION_TARGET = "runtime.isLineCompleted";
export const AUTO_MODE_CONDITION_TARGET = "runtime.autoMode";
export const SKIP_MODE_CONDITION_TARGET = "runtime.skipMode";

const VARIABLE_TARGET_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIABLE_TARGET_BRACKET_PATTERN = /^variables\[(.+)\]$/;
const VARIABLE_TARGET_DOT_PATTERN = /^variables\.([A-Za-z_$][A-Za-z0-9_$]*)$/;

export const toVariableConditionTarget = (variableId) => {
  if (typeof variableId !== "string" || variableId.length === 0) {
    return undefined;
  }

  if (VARIABLE_TARGET_IDENTIFIER.test(variableId)) {
    return `variables.${variableId}`;
  }

  return `variables[${JSON.stringify(variableId)}]`;
};

export const parseVariableConditionTarget = (target) => {
  if (typeof target !== "string" || target.length === 0) {
    return undefined;
  }

  const dotMatch = target.match(VARIABLE_TARGET_DOT_PATTERN);
  if (dotMatch) {
    return dotMatch[1];
  }

  const bracketMatch = target.match(VARIABLE_TARGET_BRACKET_PATTERN);
  if (!bracketMatch) {
    return undefined;
  }

  const rawValue = bracketMatch[1].trim();

  try {
    const variableId = JSON.parse(rawValue);
    if (typeof variableId === "string" && variableId.length > 0) {
      return variableId;
    }
  } catch {}

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    const variableId = rawValue.slice(1, -1);
    if (variableId.length > 0) {
      return variableId;
    }
  }

  return undefined;
};

export const getRuntimeLayoutConditionItems = () => {
  return getRuntimeConditionItems();
};

export const getSpecialLayoutConditionItems = ({
  includeSaveDataAvailable = false,
} = {}) => {
  const items = {
    ...getRuntimeConditionItems(),
  };

  if (includeSaveDataAvailable) {
    items[SAVE_DATA_AVAILABLE_CONDITION_TARGET] = {
      id: SAVE_DATA_AVAILABLE_CONDITION_TARGET,
      target: SAVE_DATA_AVAILABLE_CONDITION_TARGET,
      name: "Save Data Available",
      type: "boolean",
      source: "slot",
      description: "Whether this save/load slot already has saved data",
    };
  }

  return items;
};

const trimOuterParentheses = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  let nextValue = value.trim();

  while (nextValue.startsWith("(") && nextValue.endsWith(")")) {
    let depth = 0;
    let isBalanced = true;

    for (let index = 0; index < nextValue.length; index += 1) {
      const char = nextValue[index];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0 && index < nextValue.length - 1) {
          isBalanced = false;
          break;
        }
      }

      if (depth < 0) {
        isBalanced = false;
        break;
      }
    }

    if (!isBalanced || depth !== 0) {
      break;
    }

    nextValue = nextValue.slice(1, -1).trim();
  }

  return nextValue;
};

const splitTopLevelAndExpressions = (expression) => {
  if (typeof expression !== "string" || expression.trim().length === 0) {
    return [];
  }

  const parts = [];
  let current = "";
  let depth = 0;
  let quote;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    const nextChar = expression[index + 1];

    if (quote) {
      current += char;
      if (char === "\\" && nextChar) {
        current += nextChar;
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      current += char;
      continue;
    }

    if (depth === 0 && char === "&" && nextChar === "&") {
      parts.push(trimOuterParentheses(current));
      current = "";
      index += 1;
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(trimOuterParentheses(current));
  }

  return parts.filter((part) => part.length > 0);
};

const parseConditionValue = (value) => {
  const normalizedValue = value.trim();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalizedValue)) {
    const parsedNumber = Number(normalizedValue);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber;
    }
  }

  if (normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) {
    try {
      return JSON.parse(normalizedValue);
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const buildScalarConditionExpression = (target, value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${target} == ${value}`;
  }

  if (typeof value === "boolean") {
    return `${target} == ${value}`;
  }

  return `${target} == ${JSON.stringify(String(value ?? ""))}`;
};

export const buildLayoutConditionExpression = (condition) => {
  if (condition?.op !== "eq") {
    return undefined;
  }

  const target = condition?.target;
  if (typeof target !== "string" || target.length === 0) {
    return undefined;
  }

  if (
    target === SAVE_DATA_AVAILABLE_CONDITION_TARGET &&
    typeof condition.value === "boolean"
  ) {
    return condition.value === false
      ? "!item.savedAt"
      : SAVE_DATA_AVAILABLE_CONDITION_TARGET;
  }

  return buildScalarConditionExpression(target, condition.value);
};

export const mergeWhenExpressions = (...expressions) => {
  const normalizedExpressions = expressions.filter(
    (expression) => typeof expression === "string" && expression.length > 0,
  );

  if (normalizedExpressions.length === 0) {
    return undefined;
  }

  if (normalizedExpressions.length === 1) {
    return normalizedExpressions[0];
  }

  return normalizedExpressions
    .map((expression) => `(${expression})`)
    .join(" && ");
};

const parseConditionTargetClause = (clause) => {
  if (
    clause === SAVE_DATA_AVAILABLE_CONDITION_TARGET ||
    clause === "item.date"
  ) {
    return {
      target: SAVE_DATA_AVAILABLE_CONDITION_TARGET,
      op: "eq",
      value: true,
    };
  }

  if (clause === "!item.savedAt" || clause === "!item.date") {
    return {
      target: SAVE_DATA_AVAILABLE_CONDITION_TARGET,
      op: "eq",
      value: false,
    };
  }

  for (const fixedStateItem of Object.values(getRuntimeConditionItems())) {
    const escapedTarget = fixedStateItem.target.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const match = clause.match(new RegExp(`^${escapedTarget}\\s*==\\s*(.+)$`));
    if (!match) {
      continue;
    }

    const value = parseConditionValue(match[1]);
    if (value === undefined) {
      continue;
    }

    return {
      target: fixedStateItem.target,
      op: "eq",
      value,
    };
  }

  const variableMatch = clause.match(
    /^((?:variables\.[A-Za-z_$][A-Za-z0-9_$]*|variables\[(?:".*"|'.*')\]))\s*==\s*(.+)$/,
  );
  if (!variableMatch) {
    return undefined;
  }

  const variableId = parseVariableConditionTarget(variableMatch[1]);
  const value = parseConditionValue(variableMatch[2]);

  if (!variableId || value === undefined) {
    return undefined;
  }

  return {
    target: toVariableConditionTarget(variableId),
    op: "eq",
    value,
  };
};

export const splitLayoutConditionFromWhen = (expression) => {
  const clauses = splitTopLevelAndExpressions(expression);
  if (clauses.length === 0) {
    return {
      baseWhen: undefined,
      visibilityCondition: undefined,
    };
  }

  let visibilityClauseIndex = -1;
  let visibilityCondition;

  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    const parsedCondition = parseConditionTargetClause(clause);

    if (!parsedCondition) {
      continue;
    }

    visibilityClauseIndex = index;
    visibilityCondition = parsedCondition;
    break;
  }

  if (!visibilityCondition) {
    return {
      baseWhen: typeof expression === "string" ? expression : undefined,
      visibilityCondition: undefined,
    };
  }

  const remainingClauses = clauses.filter(
    (_clause, index) => index !== visibilityClauseIndex,
  );

  return {
    baseWhen: mergeWhenExpressions(...remainingClauses),
    visibilityCondition,
  };
};

export const getFixedVisibilityStateItems = getRuntimeLayoutConditionItems;
export const buildVisibilityConditionExpression =
  buildLayoutConditionExpression;
export const splitVisibilityConditionFromWhen = splitLayoutConditionFromWhen;
