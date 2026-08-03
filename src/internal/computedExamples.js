const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const decodeQuotedPathPart = (path, startIndex, quote) => {
  let value = "";
  let index = startIndex;

  while (index < path.length) {
    const character = path[index];
    if (character === quote) {
      return { value, endIndex: index + 1 };
    }
    if (character !== "\\") {
      value += character;
      index += 1;
      continue;
    }

    index += 1;
    const escaped = path[index];
    const escapedCharacters = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    if (escaped === "u") {
      const hex = path.slice(index + 1, index + 5);
      if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
        return undefined;
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }
    value += escapedCharacters[escaped] ?? escaped;
    index += 1;
  }

  return undefined;
};

const parseComputedReferenceRoot = (path) => {
  if (typeof path !== "string") {
    return undefined;
  }
  const namespace = path.startsWith("variables")
    ? "variables"
    : path.startsWith("runtime")
      ? "runtime"
      : undefined;
  if (!namespace) {
    return undefined;
  }

  let index = namespace.length;
  if (path[index] === ".") {
    index += 1;
    const startIndex = index;
    while (index < path.length && path[index] !== "." && path[index] !== "[") {
      index += 1;
    }
    const id = path.slice(startIndex, index);
    return id ? { namespace, id } : undefined;
  }
  if (path[index] !== "[") {
    return undefined;
  }

  index += 1;
  while (/\s/.test(path[index] ?? "")) {
    index += 1;
  }
  const quote = path[index];
  if (quote === '"' || quote === "'") {
    const decoded = decodeQuotedPathPart(path, index + 1, quote);
    return decoded?.value ? { namespace, id: decoded.value } : undefined;
  }

  const startIndex = index;
  while (/\d/.test(path[index] ?? "")) {
    index += 1;
  }
  const id = path.slice(startIndex, index);
  return id ? { namespace, id } : undefined;
};

const collectExpressionReferences = (expression, references) => {
  if (expression === null || typeof expression !== "object") {
    return;
  }
  if (Array.isArray(expression)) {
    expression.forEach((item) => {
      collectExpressionReferences(item, references);
    });
    return;
  }
  if (Object.hasOwn(expression, "literal")) {
    return;
  }
  if (Object.hasOwn(expression, "var")) {
    const reference = parseComputedReferenceRoot(expression.var);
    if (reference) {
      references[reference.namespace].add(reference.id);
    }
    return;
  }
  Object.values(expression).forEach((item) => {
    collectExpressionReferences(item, references);
  });
};

export const collectComputedInputReferences = (computed = {}) => {
  const references = {
    variables: new Set(),
    runtime: new Set(),
  };
  if (!isRecord(computed)) {
    return { variables: [], runtime: [] };
  }

  if (Array.isArray(computed.branches)) {
    computed.branches.forEach((branch) => {
      collectExpressionReferences(branch?.when, references);
      if (Object.hasOwn(branch ?? {}, "expr")) {
        collectExpressionReferences(branch.expr, references);
      }
    });
    if (Object.hasOwn(computed.default ?? {}, "expr")) {
      collectExpressionReferences(computed.default.expr, references);
    }
  } else if (Object.hasOwn(computed, "expr")) {
    collectExpressionReferences(computed.expr, references);
  }

  return {
    variables: [...references.variables],
    runtime: [...references.runtime],
  };
};

export const toExecutableComputed = (computed) => {
  if (!isRecord(computed)) {
    return computed;
  }

  const executableComputed = structuredClone(computed);
  delete executableComputed.examples;
  return executableComputed;
};
