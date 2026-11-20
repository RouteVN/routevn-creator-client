import { parseConditionExpression } from "jempl";
import { BinaryOp, NodeType } from "jempl/src/parse/constants.js";
import { getRuntimeConditionItems } from "./runtimeFields.js";

export const SAVE_DATA_AVAILABLE_CONDITION_TARGET = "item.savedAt";
export const DIALOGUE_CHARACTER_ID_CONDITION_TARGET = "dialogue.characterId";
export const LINE_COMPLETED_CONDITION_TARGET = "runtime.isLineCompleted";
export const AUTO_MODE_CONDITION_TARGET = "runtime.autoMode";
export const SKIP_MODE_CONDITION_TARGET = "runtime.skipMode";

const VARIABLE_TARGET_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIABLE_TARGET_BRACKET_PATTERN = /^variables\[(.+)\]$/;
const VARIABLE_TARGET_DOT_PATTERN = /^variables\.([A-Za-z_$][A-Za-z0-9_$]*)$/;

const CONDITION_SYMBOLS = {
  eq: "==",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};
const OP_BY_SYMBOL = new Map(
  Object.entries(CONDITION_SYMBOLS).map(([op, symbol]) => [symbol, op]),
);
const NUMBER_OPERATORS = Object.keys(CONDITION_SYMBOLS);
const STRING_OPERATORS = ["eq", "neq"];
const BOOLEAN_OPERATORS = ["eq"];

export const getVisibilityConditionOperators = (type) => {
  if (type === "number") return NUMBER_OPERATORS;
  if (type === "string") return STRING_OPERATORS;
  return BOOLEAN_OPERATORS;
};

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

  items[DIALOGUE_CHARACTER_ID_CONDITION_TARGET] = {
    id: DIALOGUE_CHARACTER_ID_CONDITION_TARGET,
    target: DIALOGUE_CHARACTER_ID_CONDITION_TARGET,
    name: "Current Dialogue Character",
    type: "string",
    source: "dialogue",
    valueKind: "character",
    description:
      "The current dialogue speaker character id for the active line",
  };

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
    let quote;

    for (let index = 0; index < nextValue.length; index += 1) {
      const char = nextValue[index];
      if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = undefined;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
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

    if (depth === 0 && char === "|" && nextChar === "|") {
      return [expression];
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

  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(normalizedValue)) {
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

const isLayoutComparison = (condition) =>
  typeof condition?.target === "string" &&
  condition.target.length > 0 &&
  getVisibilityConditionOperators(typeof condition.value).includes(
    condition.op,
  );

export const buildLayoutConditionExpression = (condition) => {
  if (!isLayoutComparison(condition)) return undefined;
  const { target } = condition;
  if (
    target === SAVE_DATA_AVAILABLE_CONDITION_TARGET &&
    typeof condition.value === "boolean"
  ) {
    return condition.value === false
      ? "!item.savedAt"
      : SAVE_DATA_AVAILABLE_CONDITION_TARGET;
  }

  const literal = JSON.stringify(condition.value ?? "");
  return `${target} ${CONDITION_SYMBOLS[condition.op]} ${literal}`;
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

  const match = clause.match(
    /^([\w$]+\.[\w$]+|variables\[(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\])\s*(==|!=|>=|<=|>|<)\s*(.+)$/s,
  );
  if (!match) return undefined;

  const [, target, symbol, literal] = match;
  const value = parseConditionValue(literal);
  const op = OP_BY_SYMBOL.get(symbol);
  if (
    value === undefined ||
    !getVisibilityConditionOperators(typeof value).includes(op)
  ) {
    return undefined;
  }

  const variableId = parseVariableConditionTarget(target);
  if (variableId)
    return { target: toVariableConditionTarget(variableId), op, value };

  const field = getSpecialLayoutConditionItems({
    includeSaveDataAvailable: true,
  })[target];
  if (field && getVisibilityConditionOperators(field.type).includes(op)) {
    return { target, op, value };
  }

  return undefined;
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

  // The editor appends its editable condition after the existing clauses.
  for (let index = clauses.length - 1; index >= 0; index -= 1) {
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

// Project data keeps the editable expression. Playback gets the literal value
// directly so quotes, backslashes and operator characters survive rendering.
export const compileVisibilityCondition = (condition) => {
  if (!isLayoutComparison(condition)) return undefined;
  const { target, op, value } = condition;
  const variable = { var: target };
  if (
    target === SAVE_DATA_AVAILABLE_CONDITION_TARGET &&
    typeof value === "boolean"
  ) {
    return value ? variable : { not: variable };
  }
  return { [op]: [variable, value ?? ""] };
};

const jsonBinaryOperators = {
  [BinaryOp.EQ]: "eq",
  [BinaryOp.NEQ]: "neq",
  [BinaryOp.GT]: "gt",
  [BinaryOp.GTE]: "gte",
  [BinaryOp.LT]: "lt",
  [BinaryOp.LTE]: "lte",
  [BinaryOp.IN]: "in",
  [BinaryOp.AND]: "all",
  [BinaryOp.OR]: "any",
  [BinaryOp.ADD]: "add",
  [BinaryOp.SUBTRACT]: "sub",
};

// Jempl's JSON form treats every string as a literal. Parse an existing
// expression with Jempl before combining it with an editor comparison.
const toConditionJson = (node) => {
  switch (node.type) {
    case NodeType.VARIABLE:
      return { var: node.path };
    case NodeType.LITERAL:
      return { literal: node.value };
    case NodeType.FUNCTION:
      return { call: node.name, args: node.args.map(toConditionJson) };
    case NodeType.UNARY:
      return { not: toConditionJson(node.operand) };
    case NodeType.BINARY:
      return {
        [jsonBinaryOperators[node.op]]: [
          toConditionJson(node.left),
          toConditionJson(node.right),
        ],
      };
    default:
      throw new Error("Unsupported layout condition expression");
  }
};

export const combineLayoutConditions = (operator, ...conditions) => {
  const parts = conditions.filter((condition) => condition !== undefined);
  if (parts.length < 2) return parts[0];
  return {
    [operator]: parts.map((part) =>
      typeof part === "string"
        ? toConditionJson(parseConditionExpression(part))
        : part,
    ),
  };
};

export const compileSavedLayoutWhen = (expression) => {
  if (typeof expression !== "string") return expression;
  const clauses = splitTopLevelAndExpressions(trimOuterParentheses(expression));
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) {
    const comparison = parseConditionTargetClause(clauses[0]);
    return comparison ? compileVisibilityCondition(comparison) : expression;
  }

  const conditions = clauses.map(compileSavedLayoutWhen);
  return conditions.some((condition) => typeof condition === "object")
    ? combineLayoutConditions("all", ...conditions)
    : expression;
};

export const getFixedVisibilityStateItems = getRuntimeLayoutConditionItems;
export const buildVisibilityConditionExpression =
  buildLayoutConditionExpression;
export const splitVisibilityConditionFromWhen = splitLayoutConditionFromWhen;
