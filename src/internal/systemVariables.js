import { SYSTEM_VARIABLE_GROUPS } from "@routevn/creator-model";

const createSystemVariableItem = ({
  id,
  name,
  scope,
  type,
  default: defaultValue,
  description,
} = {}) => {
  return {
    id,
    name,
    scope,
    type,
    default: defaultValue,
    value: defaultValue,
    description,
    readOnly: true,
    source: "system",
  };
};

export const createSystemVariablesData = () => {
  const items = {};
  const tree = [];

  for (const group of SYSTEM_VARIABLE_GROUPS) {
    const groupId = `system-variables:${group.id}`;
    items[groupId] = {
      id: groupId,
      type: "folder",
      name: group.name,
    };
    tree.push({
      id: groupId,
      children: (group.variables || []).map((variable) => ({
        id: variable.id,
      })),
    });

    for (const variable of group.variables || []) {
      items[variable.id] = {
        ...createSystemVariableItem(variable),
        parentId: groupId,
      };
    }
  }

  return {
    items,
    tree,
  };
};

export const getSystemVariableItems = () => {
  const data = createSystemVariablesData();
  return Object.fromEntries(
    Object.entries(data.items).filter(([, item]) => item.type !== "folder"),
  );
};
