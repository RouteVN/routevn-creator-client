export const SAVE_DATA_AVAILABLE_CONDITION_ID = "__saveDataAvailable";
export const LINE_COMPLETED_CONDITION_ID = "__isLineCompleted";
export const AUTO_MODE_CONDITION_ID = "__autoMode";
export const SKIP_MODE_CONDITION_ID = "__skipMode";

const RUNTIME_LAYOUT_CONDITION_ITEMS = {
  [LINE_COMPLETED_CONDITION_ID]: {
    id: LINE_COMPLETED_CONDITION_ID,
    name: "Line Completed",
    type: "boolean",
    source: "runtime",
    description: "Whether the current line has fully completed rendering",
    accessor: "isLineCompleted",
  },
  [AUTO_MODE_CONDITION_ID]: {
    id: AUTO_MODE_CONDITION_ID,
    name: "Auto Mode",
    type: "boolean",
    source: "runtime",
    description: "Whether auto mode is currently enabled",
    accessor: "autoMode",
  },
  [SKIP_MODE_CONDITION_ID]: {
    id: SKIP_MODE_CONDITION_ID,
    name: "Skip Mode",
    type: "boolean",
    source: "runtime",
    description: "Whether skip mode is currently enabled",
    accessor: "skipMode",
  },
};

export const getRuntimeLayoutConditionItems = () => {
  return RUNTIME_LAYOUT_CONDITION_ITEMS;
};

export const getSpecialLayoutConditionItems = ({
  includeSaveDataAvailable = false,
} = {}) => {
  const items = {
    ...RUNTIME_LAYOUT_CONDITION_ITEMS,
  };

  if (includeSaveDataAvailable) {
    items[SAVE_DATA_AVAILABLE_CONDITION_ID] = {
      id: SAVE_DATA_AVAILABLE_CONDITION_ID,
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

export const buildLayoutConditionExpression = (condition) => {
  if (
    condition?.variableId === SAVE_DATA_AVAILABLE_CONDITION_ID &&
    condition?.op === "eq"
  ) {
    return condition.value === false ? "!item.savedAt" : "item.savedAt";
  }

  const fixedStateItem =
    getRuntimeLayoutConditionItems()?.[condition?.variableId];
  if (fixedStateItem && condition?.op === "eq") {
    const conditionValue = condition.value;

    if (typeof conditionValue === "number" && Number.isFinite(conditionValue)) {
      return `${fixedStateItem.accessor} == ${conditionValue}`;
    }

    if (typeof conditionValue === "boolean") {
      return `${fixedStateItem.accessor} == ${conditionValue}`;
    }

    return `${fixedStateItem.accessor} == ${JSON.stringify(
      String(conditionValue ?? ""),
    )}`;
  }

  if (!condition?.variableId || typeof condition.variableId !== "string") {
    return undefined;
  }

  if (condition.op !== "eq") {
    return undefined;
  }

  const variableAccess = `variables[${JSON.stringify(condition.variableId)}]`;
  const conditionValue = condition.value;

  if (typeof conditionValue === "number" && Number.isFinite(conditionValue)) {
    return `${variableAccess} == ${conditionValue}`;
  }

  if (typeof conditionValue === "boolean") {
    return `${variableAccess} == ${conditionValue}`;
  }

  return `${variableAccess} == ${JSON.stringify(String(conditionValue ?? ""))}`;
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

    if (
      clause === "item.savedAt" ||
      clause === "!item.savedAt" ||
      clause === "item.date" ||
      clause === "!item.date"
    ) {
      visibilityClauseIndex = index;
      visibilityCondition = {
        variableId: SAVE_DATA_AVAILABLE_CONDITION_ID,
        op: "eq",
        value: clause === "item.savedAt" || clause === "item.date",
      };
      break;
    }

    for (const fixedStateItem of Object.values(
      getRuntimeLayoutConditionItems(),
    )) {
      const escapedAccessor = fixedStateItem.accessor.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const match = clause.match(
        new RegExp(`^${escapedAccessor}\\s*==\\s*(.+)$`),
      );
      if (!match) {
        continue;
      }

      const value = parseConditionValue(match[1]);
      if (value === undefined) {
        continue;
      }

      visibilityClauseIndex = index;
      visibilityCondition = {
        variableId: fixedStateItem.id,
        op: "eq",
        value,
      };
      break;
    }

    if (visibilityCondition) {
      break;
    }

    const match = clause.match(/^variables\[(.+)\]\s*==\s*(.+)$/);
    if (!match) {
      continue;
    }

    try {
      const variableId = JSON.parse(match[1].trim());
      const value = parseConditionValue(match[2]);

      if (
        typeof variableId === "string" &&
        variableId.length > 0 &&
        value !== undefined
      ) {
        visibilityClauseIndex = index;
        visibilityCondition = {
          variableId,
          op: "eq",
          value,
        };
        break;
      }
    } catch {
      continue;
    }
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
