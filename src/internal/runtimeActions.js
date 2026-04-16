import { getRuntimeFieldItem } from "./runtimeFields.js";

const BOOLEAN_OPTIONS = Object.freeze([
  { label: "True", value: true },
  { label: "False", value: false },
]);

const VALUE_SOURCE_OPTIONS = Object.freeze([
  { label: "Specific Value", value: "fixed" },
  { label: "Current Value", value: "event" },
]);

const EVENT_VALUE_BINDING = "_event.value";

const createValueActionDefinition = ({
  mode,
  label,
  icon,
  runtimeId,
  inputType,
  min,
  step,
  description,
  placeholder,
} = {}) => {
  const field = getRuntimeFieldItem(runtimeId);

  return {
    mode,
    label,
    icon,
    runtimeId,
    inputType,
    description: description ?? field?.description,
    defaultValue: field?.default,
    valueLabel: "Value",
    placeholder,
    min,
    step,
  };
};

const createEmptyActionDefinition = ({
  mode,
  label,
  icon,
  description,
} = {}) => {
  return {
    mode,
    label,
    icon,
    inputType: "none",
    description,
  };
};

export const RUNTIME_ACTION_DEFINITIONS = Object.freeze({
  setDialogueTextSpeed: createValueActionDefinition({
    mode: "setDialogueTextSpeed",
    label: "Set Dialogue Text Speed",
    icon: "settings",
    runtimeId: "dialogueTextSpeed",
    inputType: "number",
    min: 0,
    step: 1,
  }),
  setAutoForwardDelay: createValueActionDefinition({
    mode: "setAutoForwardDelay",
    label: "Set Auto Forward Delay",
    icon: "play",
    runtimeId: "autoForwardDelay",
    inputType: "number",
    min: 0,
    step: 1,
  }),
  setSkipUnseenText: createValueActionDefinition({
    mode: "setSkipUnseenText",
    label: "Set Skip Unseen Text",
    icon: "next-line",
    runtimeId: "skipUnseenText",
    inputType: "boolean",
  }),
  setSkipTransitionsAndAnimations: createValueActionDefinition({
    mode: "setSkipTransitionsAndAnimations",
    label: "Set Skip Transitions And Animations",
    icon: "transition",
    runtimeId: "skipTransitionsAndAnimations",
    inputType: "boolean",
  }),
  setSoundVolume: createValueActionDefinition({
    mode: "setSoundVolume",
    label: "Set Sound Volume",
    icon: "audio",
    runtimeId: "soundVolume",
    inputType: "number",
    min: 0,
    step: 1,
  }),
  setMusicVolume: createValueActionDefinition({
    mode: "setMusicVolume",
    label: "Set Music Volume",
    icon: "music",
    runtimeId: "musicVolume",
    inputType: "number",
    min: 0,
    step: 1,
  }),
  setMuteAll: createValueActionDefinition({
    mode: "setMuteAll",
    label: "Set Mute All",
    icon: "audio",
    runtimeId: "muteAll",
    inputType: "boolean",
  }),
  setSaveLoadPagination: createValueActionDefinition({
    mode: "setSaveLoadPagination",
    label: "Set Save/Load Pagination",
    icon: "settings",
    runtimeId: "saveLoadPagination",
    inputType: "number",
    min: 1,
    step: 1,
  }),
  incrementSaveLoadPagination: createEmptyActionDefinition({
    mode: "incrementSaveLoadPagination",
    label: "Next Save/Load Page",
    icon: "settings",
    description: "Increment the current save/load pagination page.",
  }),
  decrementSaveLoadPagination: createEmptyActionDefinition({
    mode: "decrementSaveLoadPagination",
    label: "Previous Save/Load Page",
    icon: "settings",
    description: "Decrement the current save/load pagination page.",
  }),
  setMenuPage: createValueActionDefinition({
    mode: "setMenuPage",
    label: "Set Current Menu Page",
    icon: "settings",
    runtimeId: "menuPage",
    inputType: "text",
    placeholder: "menu-page-id",
  }),
  setMenuEntryPoint: createValueActionDefinition({
    mode: "setMenuEntryPoint",
    label: "Set Menu Entry Point",
    icon: "settings",
    runtimeId: "menuEntryPoint",
    inputType: "text",
    placeholder: "entry-point",
  }),
});

export const RUNTIME_ACTION_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(RUNTIME_ACTION_DEFINITIONS).map(([mode, definition]) => [
      mode,
      definition.label,
    ]),
  ),
);

export const RUNTIME_ACTION_ITEMS = Object.freeze([
  { id: "runtime-01", mode: "setDialogueTextSpeed" },
  { id: "runtime-02", mode: "setAutoForwardDelay" },
  { id: "runtime-03", mode: "setSkipUnseenText" },
  { id: "runtime-04", mode: "setSkipTransitionsAndAnimations" },
  { id: "runtime-05", mode: "setSoundVolume" },
  { id: "runtime-06", mode: "setMusicVolume" },
  { id: "runtime-07", mode: "setMuteAll" },
  { id: "runtime-08", mode: "setSaveLoadPagination" },
  { id: "runtime-09", mode: "incrementSaveLoadPagination" },
  { id: "runtime-10", mode: "decrementSaveLoadPagination" },
  { id: "runtime-11", mode: "setMenuPage" },
  { id: "runtime-12", mode: "setMenuEntryPoint" },
]).map((item) => ({
  ...item,
  label: RUNTIME_ACTION_DEFINITIONS[item.mode].label,
  icon: RUNTIME_ACTION_DEFINITIONS[item.mode].icon,
}));

export const getRuntimeActionDefinition = (mode) => {
  return RUNTIME_ACTION_DEFINITIONS[mode];
};

export const isRuntimeActionMode = (mode) => {
  return getRuntimeActionDefinition(mode) !== undefined;
};

export const getRuntimeActionModes = () => {
  return Object.keys(RUNTIME_ACTION_DEFINITIONS);
};

const formatPreviewValue = (definition, value) => {
  if (value === EVENT_VALUE_BINDING) {
    return "Current Value";
  }

  if (definition.inputType === "boolean") {
    return value === true ? "true" : "false";
  }

  if (value === undefined) {
    return "";
  }

  return String(value);
};

const getRuntimeActionValueSource = (value) => {
  return value === EVENT_VALUE_BINDING ? "event" : "fixed";
};

const createFixedValueField = (definition) => {
  const baseField = {
    $when: `values.valueSource == 'fixed'`,
    name: "value",
    label: definition.valueLabel,
  };

  if (definition.inputType === "boolean") {
    return {
      ...baseField,
      type: "select",
      clearable: false,
      options: BOOLEAN_OPTIONS,
      description: definition.description,
    };
  }

  return {
    ...baseField,
    type: definition.inputType === "number" ? "input-number" : "input-text",
    description: definition.description,
    min: definition.min,
    step: definition.step,
    placeholder: definition.placeholder,
  };
};

export const createRuntimeActionForm = (mode) => {
  const definition = getRuntimeActionDefinition(mode);
  if (!definition) {
    return undefined;
  }

  if (definition.inputType === "none") {
    return {
      title: definition.label,
      description: definition.description,
      fields: [],
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            label: "Apply",
          },
        ],
      },
    };
  }

  return {
    title: definition.label,
    fields: [
      {
        name: "valueSource",
        type: "segmented-control",
        label: "Set To",
        options: VALUE_SOURCE_OPTIONS,
        description:
          "Specific Value lets you enter a value. Current Value uses the value from the triggering control.",
      },
      createFixedValueField(definition),
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Submit",
        },
      ],
    },
  };
};

export const createRuntimeActionDefaultValues = (mode, action = {}) => {
  const definition = getRuntimeActionDefinition(mode);
  if (!definition) {
    return {};
  }

  if (definition.inputType === "none") {
    return {};
  }

  const valueSource = getRuntimeActionValueSource(action.value);

  return {
    valueSource,
    value:
      valueSource === "fixed"
        ? (action.value ?? definition.defaultValue)
        : definition.defaultValue,
  };
};

export const createRuntimeActionSubmitDetail = (mode, values = {}) => {
  const definition = getRuntimeActionDefinition(mode);
  if (!definition) {
    return undefined;
  }

  if (definition.inputType === "none") {
    return {
      [mode]: {},
    };
  }

  const valueSource = values.valueSource === "event" ? "event" : "fixed";

  return {
    [mode]: {
      value: valueSource === "event" ? EVENT_VALUE_BINDING : values.value,
    },
  };
};

export const createRuntimeActionPreview = (mode, action = {}) => {
  const definition = getRuntimeActionDefinition(mode);
  if (!definition) {
    return undefined;
  }

  const summary =
    definition.inputType === "none"
      ? definition.label
      : `${definition.label}: ${formatPreviewValue(definition, action.value)}`;

  return {
    mode,
    icon: definition.icon,
    label: definition.label,
    summary,
  };
};
