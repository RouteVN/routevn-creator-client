import { resolveComputedVariables } from "route-engine-js";
import {
  collectComputedInputReferences,
  toExecutableComputed,
} from "../../../internal/computedExamples.js";
import { getRuntimeFieldItems } from "../../../internal/runtimeFields.js";

const flattenVariableItems = (flatGroups = []) =>
  (flatGroups ?? [])
    .flatMap((group) => group.children ?? [])
    .filter((item) => item.type === "variable");

const cloneValue = (value) =>
  value === undefined ? undefined : structuredClone(value);

const getVariableType = (item = {}) => item.variableType ?? "string";

const getInitialInputValue = (item = {}) =>
  cloneValue(item.value ?? item.default ?? getDefaultValueForType(item.type));

const getDefaultValueForType = (type) => {
  if (type === "number") {
    return 0;
  }
  if (type === "boolean") {
    return false;
  }
  if (type === "object") {
    return {};
  }
  return "";
};

export const createComputedExampleInputItems = ({
  computed,
  flatGroups = [],
} = {}) => {
  const variableItems = flattenVariableItems(flatGroups);
  const variableItemsById = new Map(
    variableItems.map((item) => [item.id, item]),
  );
  const runtimeItems = getRuntimeFieldItems();
  const inputItems = [];
  const addedKeys = new Set();
  const visitedComputedVariableIds = new Set();

  const addInputItem = ({ source, id, item }) => {
    const key = `${source}:${id}`;
    if (addedKeys.has(key)) {
      return;
    }
    addedKeys.add(key);
    const type =
      source === "variables" ? getVariableType(item) : (item?.type ?? "string");
    inputItems.push({
      source,
      id,
      name: item?.name ?? id,
      type,
      defaultValue: getInitialInputValue({ ...item, type }),
    });
  };

  const visitComputed = (definition) => {
    const references = collectComputedInputReferences(definition);
    references.variables.forEach((variableId) => {
      const item = variableItemsById.get(variableId);
      if (item?.computed !== undefined) {
        if (!visitedComputedVariableIds.has(variableId)) {
          visitedComputedVariableIds.add(variableId);
          visitComputed(item.computed);
        }
        return;
      }
      addInputItem({ source: "variables", id: variableId, item });
    });
    references.runtime.forEach((runtimeId) => {
      addInputItem({
        source: "runtime",
        id: runtimeId,
        item: runtimeItems[runtimeId],
      });
    });
  };

  visitComputed(computed);
  return inputItems.map((item, index) => ({
    ...item,
    formName: `input${index}`,
  }));
};

const toFormValue = (value, type) => {
  if (type === "object") {
    return JSON.stringify(value ?? {}, undefined, 2);
  }
  return cloneValue(value);
};

export const resolveComputedExampleInputValue = ({ item, example } = {}) => {
  const namespace = example?.input?.[item.source];
  return Object.hasOwn(namespace ?? {}, item.id)
    ? namespace[item.id]
    : item.defaultValue;
};

export const createComputedExampleDefaultValues = ({
  inputItems = [],
  example,
} = {}) => ({
  name: example?.name ?? "",
  ...Object.fromEntries(
    inputItems.map((item) => [
      item.formName,
      toFormValue(
        resolveComputedExampleInputValue({ item, example }),
        item.type,
      ),
    ]),
  ),
});

const parseInputValue = (value, type) => {
  if (type === "number") {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error("number");
    }
    return numberValue;
  }
  if (type === "boolean") {
    return value === true || value === "true";
  }
  if (type === "object") {
    const objectValue = JSON.parse(value);
    if (objectValue === null || typeof objectValue !== "object") {
      throw new Error("object");
    }
    return objectValue;
  }
  return value ?? "";
};

export const buildComputedExampleInput = ({
  inputItems = [],
  values = {},
} = {}) => {
  const input = {};
  inputItems.forEach((item) => {
    input[item.source] ??= {};
    input[item.source][item.id] = parseInputValue(
      values[item.formName],
      item.type,
    );
  });
  return input;
};

const toEngineVariableConfig = (item = {}) => {
  const config = {
    type: getVariableType(item),
    scope: item.computed === undefined ? (item.scope ?? "context") : "context",
  };
  if (item.computed !== undefined) {
    config.computed = toExecutableComputed(item.computed);
  } else {
    config.default = cloneValue(item.default ?? item.value);
  }
  return config;
};

export const evaluateComputedExample = ({
  computed,
  variableType,
  flatGroups = [],
  input = {},
} = {}) => {
  if (!computed) {
    return { valid: false };
  }

  try {
    const variableItems = flattenVariableItems(flatGroups);
    const variableConfigs = Object.fromEntries(
      variableItems.map((item) => [item.id, toEngineVariableConfig(item)]),
    );
    const variables = Object.fromEntries(
      variableItems
        .filter((item) => item.computed === undefined)
        .map((item) => [
          item.id,
          cloneValue(
            item.value ??
              item.default ??
              getDefaultValueForType(item.variableType),
          ),
        ]),
    );
    Object.assign(variables, structuredClone(input.variables ?? {}));
    const runtime = Object.fromEntries(
      Object.entries(getRuntimeFieldItems()).map(([id, item]) => [
        id,
        cloneValue(item.default),
      ]),
    );
    Object.assign(runtime, structuredClone(input.runtime ?? {}));

    let resultVariableId = "__computedExampleResult";
    while (Object.hasOwn(variableConfigs, resultVariableId)) {
      resultVariableId = `_${resultVariableId}`;
    }
    variableConfigs[resultVariableId] = {
      type: variableType,
      scope: "context",
      computed: toExecutableComputed(computed),
    };
    const result = resolveComputedVariables({
      variableConfigs,
      variables,
      runtime,
    })[resultVariableId];
    return { valid: true, value: result };
  } catch {
    return { valid: false };
  }
};

export const formatComputedExampleValue = (value) => {
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
};
