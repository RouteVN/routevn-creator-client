export const DEFAULT_CLIENT_AUDIO_VOLUME = 75;

const RUNTIME_FIELD_GROUPS = Object.freeze([
  {
    id: "routeEngine",
    name: "Route Engine",
    fields: Object.freeze([
      {
        id: "dialogueTextSpeed",
        name: "Dialogue Text Speed",
        type: "number",
        scope: "device",
        default: 50,
        description: "Controls the default dialogue text reveal speed.",
      },
      {
        id: "autoForwardDelay",
        name: "Auto Forward Delay",
        type: "number",
        scope: "device",
        default: 1000,
        description: "Controls the default auto mode delay in milliseconds.",
      },
      {
        id: "skipUnseenText",
        name: "Skip Unseen Text",
        type: "boolean",
        scope: "device",
        default: false,
        description:
          "When enabled, skip mode can continue through lines the player has not viewed yet.",
      },
      {
        id: "skipTransitionsAndAnimations",
        name: "Skip Transitions And Animations",
        type: "boolean",
        scope: "device",
        default: false,
        description:
          "When enabled, transitions and animations are skipped during presentation.",
      },
      {
        id: "soundVolume",
        name: "Sound Volume",
        type: "number",
        scope: "device",
        default: DEFAULT_CLIENT_AUDIO_VOLUME,
        min: 0,
        max: 100,
        description: "Controls the effective sound effects volume.",
      },
      {
        id: "musicVolume",
        name: "Music Volume",
        type: "number",
        scope: "device",
        default: DEFAULT_CLIENT_AUDIO_VOLUME,
        min: 0,
        max: 100,
        description: "Controls the effective music volume.",
      },
      {
        id: "muteAll",
        name: "Mute All",
        type: "boolean",
        scope: "device",
        default: false,
        description: "Controls whether all audio output is muted.",
      },
      {
        id: "saveLoadPagination",
        name: "Save/Load Pagination",
        type: "number",
        scope: "context",
        default: 1,
        description:
          "Tracks the current save/load pagination page for the active context.",
      },
      {
        id: "menuPage",
        name: "Menu Page",
        type: "string",
        scope: "context",
        default: "",
        description: "Tracks the current menu page id for the active UI flow.",
      },
      {
        id: "menuEntryPoint",
        name: "Menu Entry Point",
        type: "string",
        scope: "context",
        default: "",
        description:
          "Tracks how the current menu flow was opened for the active context.",
      },
      {
        id: "autoMode",
        name: "Auto Mode",
        type: "boolean",
        scope: "session",
        default: false,
        description: "Reflects whether auto mode is currently active.",
      },
      {
        id: "skipMode",
        name: "Skip Mode",
        type: "boolean",
        scope: "session",
        default: false,
        description: "Reflects whether skip mode is currently active.",
      },
      {
        id: "dialogueUIHidden",
        name: "Dialogue UI Hidden",
        type: "boolean",
        scope: "session",
        default: false,
        description: "Reflects whether the dialogue UI is currently hidden.",
      },
      {
        id: "isLineCompleted",
        name: "Is Line Completed",
        type: "boolean",
        scope: "session",
        default: false,
        description:
          "Reflects whether the current line has completed its presentation.",
      },
    ]),
  },
]);

const createRuntimeFieldItem = ({
  id,
  name,
  scope,
  type,
  default: defaultValue,
  min,
  max,
  description,
} = {}) => {
  const item = {
    id,
    name,
    scope,
    type,
    default: defaultValue,
    value: defaultValue,
    description,
    source: "runtime",
    readOnly: true,
  };

  if (Number.isFinite(min)) {
    item.min = min;
  }

  if (Number.isFinite(max)) {
    item.max = max;
  }

  return item;
};

const RUNTIME_FIELD_ITEMS = Object.freeze(
  Object.fromEntries(
    RUNTIME_FIELD_GROUPS.flatMap((group) =>
      (group.fields || []).map((field) => [
        field.id,
        createRuntimeFieldItem(field),
      ]),
    ),
  ),
);

export const RUNTIME_FIELD_IDS = Object.freeze(
  Object.keys(RUNTIME_FIELD_ITEMS),
);

export const toRuntimeConditionTarget = (runtimeId) => {
  if (typeof runtimeId !== "string" || runtimeId.length === 0) {
    return undefined;
  }

  return `runtime.${runtimeId}`;
};

export const parseRuntimeConditionTarget = (target) => {
  if (typeof target !== "string" || !target.startsWith("runtime.")) {
    return undefined;
  }

  const runtimeId = target.slice("runtime.".length);
  return runtimeId.length > 0 ? runtimeId : undefined;
};

export const createRuntimeFieldsData = () => {
  const items = {};
  const tree = [];

  for (const group of RUNTIME_FIELD_GROUPS) {
    const groupId = `runtime-fields:${group.id}`;
    items[groupId] = {
      id: groupId,
      type: "folder",
      name: group.name,
    };
    tree.push({
      id: groupId,
      children: (group.fields || []).map((field) => ({
        id: field.id,
      })),
    });

    for (const field of group.fields || []) {
      items[field.id] = {
        ...createRuntimeFieldItem(field),
        parentId: groupId,
      };
    }
  }

  return {
    items,
    tree,
  };
};

export const getRuntimeFieldItems = () => {
  return RUNTIME_FIELD_ITEMS;
};

export const getRuntimeFieldItem = (runtimeId) => {
  return RUNTIME_FIELD_ITEMS[runtimeId];
};

export const normalizeRuntimeFieldValue = (runtimeId, value) => {
  const field = getRuntimeFieldItem(runtimeId);
  if (!field) {
    return value;
  }

  if (field.type === "number") {
    const parsedValue = Number(value);
    let nextValue = Number.isFinite(parsedValue)
      ? parsedValue
      : Number(field.default ?? 0);

    if (!Number.isFinite(nextValue)) {
      nextValue = 0;
    }

    if (Number.isFinite(field.min)) {
      nextValue = Math.max(field.min, nextValue);
    }

    if (Number.isFinite(field.max)) {
      nextValue = Math.min(field.max, nextValue);
    }

    return nextValue;
  }

  if (field.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value === "true";
    }

    return Boolean(value ?? field.default);
  }

  return value ?? field.default ?? "";
};

export const getRuntimeNumberFieldOptions = () => {
  return Object.values(RUNTIME_FIELD_ITEMS)
    .filter((field) => field.type === "number")
    .map((field) => ({
      label: field.name,
      value: field.id,
    }));
};

export const toRuntimeTemplateValue = (runtimeId) => {
  if (typeof runtimeId !== "string" || runtimeId.length === 0) {
    return undefined;
  }

  return `\${runtime.${runtimeId}}`;
};

export const parseRuntimeTemplateValue = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = /^\$\{runtime\.([A-Za-z0-9]+)\}$/.exec(value);
  return match?.[1];
};

export const getRuntimeConditionItems = () => {
  return Object.fromEntries(
    Object.values(RUNTIME_FIELD_ITEMS).map((field) => {
      const target = toRuntimeConditionTarget(field.id);
      return [
        target,
        {
          ...field,
          target,
        },
      ];
    }),
  );
};
