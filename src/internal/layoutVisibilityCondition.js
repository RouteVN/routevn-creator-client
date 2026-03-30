export const SAVE_DATA_AVAILABLE_CONDITION_ID = "__saveDataAvailable";

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

export const buildVisibilityConditionExpression = (visibilityCondition) => {
  if (
    visibilityCondition?.variableId === SAVE_DATA_AVAILABLE_CONDITION_ID &&
    visibilityCondition?.op === "eq"
  ) {
    return visibilityCondition.value === false ? "!item.date" : "item.date";
  }

  if (
    !visibilityCondition?.variableId ||
    typeof visibilityCondition.variableId !== "string"
  ) {
    return undefined;
  }

  if (visibilityCondition.op !== "eq") {
    return undefined;
  }

  const variableAccess = `variables[${JSON.stringify(visibilityCondition.variableId)}]`;
  const conditionValue = visibilityCondition.value;

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

export const splitVisibilityConditionFromWhen = (expression) => {
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

    if (clause === "item.date" || clause === "!item.date") {
      visibilityClauseIndex = index;
      visibilityCondition = {
        variableId: SAVE_DATA_AVAILABLE_CONDITION_ID,
        op: "eq",
        value: clause === "item.date",
      };
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
