const SYSTEM_VARIABLE_GROUPS = Object.freeze([
  {
    id: "routeEngine",
    name: "Route Engine",
    variables: [
      {
        id: "_skipUnseenText",
        name: "Skip Unseen Text",
        scope: "global-device",
        type: "boolean",
        default: false,
        description:
          "When enabled, skip mode can continue through lines the player has not viewed yet.",
      },
      {
        id: "_dialogueTextSpeed",
        name: "Dialogue Text Speed",
        scope: "global-device",
        type: "number",
        default: 50,
        description:
          "Controls the default dialogue text speed stored for this device.",
      },
    ],
  },
]);

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
