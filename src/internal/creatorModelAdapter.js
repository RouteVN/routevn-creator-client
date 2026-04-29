import {
  processCommand as processCreatorModelCommand,
  replayCommands as replayCreatorModelCommands,
} from "@routevn/creator-model";
import { normalizeVariableEnumValues } from "./variableEnums.js";

class CreatorModelAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "CreatorModelAdapterError";
    this.code = "validation_failed";
  }
}

const VALID_RESULT = Object.freeze({
  valid: true,
});

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const VARIABLE_CREATE_COMMAND = "variable.create";
const VARIABLE_UPDATE_COMMAND = "variable.update";
const ANIMATION_CREATE_COMMAND = "animation.create";
const ANIMATION_UPDATE_COMMAND = "animation.update";
const ANIMATION_PREVIEW_METADATA_KEYS = Object.freeze([
  "thumbnailFileId",
  "preview",
]);

const stripVariableEnumFields = (item) => {
  if (!isPlainObject(item)) {
    return;
  }

  delete item.isEnum;
  delete item.enumValues;
};

const getVariableItems = (state) => state?.variables?.items ?? {};
const getAnimationItems = (state) => state?.animations?.items ?? {};

const hasVariableEnumMetadata = (state) => {
  const variableItems = getVariableItems(state);

  return Object.values(variableItems).some(
    (item) =>
      isPlainObject(item) &&
      (Object.prototype.hasOwnProperty.call(item, "isEnum") ||
        Object.prototype.hasOwnProperty.call(item, "enumValues")),
  );
};

const hasAnimationPreviewMetadata = (state) => {
  const animationItems = getAnimationItems(state);

  return Object.values(animationItems).some(
    (item) =>
      isPlainObject(item) &&
      item.type === "animation" &&
      ANIMATION_PREVIEW_METADATA_KEYS.some((key) =>
        Object.prototype.hasOwnProperty.call(item, key),
      ),
  );
};

const stripAnimationPreviewMetadataFields = (item) => {
  if (!isPlainObject(item)) {
    return;
  }

  for (const key of ANIMATION_PREVIEW_METADATA_KEYS) {
    delete item[key];
  }
};

const hasObjectFields = (value) =>
  isPlainObject(value) && Object.keys(value).length > 0;

export const toCreatorModelState = (state) => {
  const shouldStripVariableEnums = hasVariableEnumMetadata(state);
  const shouldStripAnimationPreview = hasAnimationPreviewMetadata(state);

  if (!shouldStripVariableEnums && !shouldStripAnimationPreview) {
    return state;
  }

  const nextState = structuredClone(state);

  if (shouldStripVariableEnums) {
    const variableItems = getVariableItems(nextState);

    for (const item of Object.values(variableItems)) {
      if (item?.type !== "folder") {
        stripVariableEnumFields(item);
      }
    }
  }

  if (shouldStripAnimationPreview) {
    const animationItems = getAnimationItems(nextState);

    for (const item of Object.values(animationItems)) {
      if (item?.type === "animation") {
        stripAnimationPreviewMetadataFields(item);
      }
    }
  }

  return nextState;
};

const commandHasVariableData = (command) =>
  (command?.type === VARIABLE_CREATE_COMMAND ||
    command?.type === VARIABLE_UPDATE_COMMAND) &&
  isPlainObject(command?.payload?.data);

const commandHasAnimationData = (command) =>
  (command?.type === ANIMATION_CREATE_COMMAND ||
    command?.type === ANIMATION_UPDATE_COMMAND) &&
  isPlainObject(command?.payload?.data);

const toCreatorModelCommand = (command) => {
  const nextCommand = structuredClone(command);

  if (commandHasVariableData(nextCommand)) {
    stripVariableEnumFields(nextCommand.payload.data);
  }

  if (commandHasAnimationData(nextCommand)) {
    stripAnimationPreviewMetadataFields(nextCommand.payload.data);
  }

  return nextCommand;
};

const isClientOwnedAnimationPreviewNoop = ({
  originalCommand,
  creatorModelCommand,
} = {}) =>
  originalCommand?.type === ANIMATION_UPDATE_COMMAND &&
  commandHasAnimationData(originalCommand) &&
  hasAnimationPreviewPayload(originalCommand.payload.data) &&
  creatorModelCommand?.type === ANIMATION_UPDATE_COMMAND &&
  !hasObjectFields(creatorModelCommand.payload?.data);

const hasVariableEnumPayload = (data) =>
  Object.prototype.hasOwnProperty.call(data || {}, "isEnum") ||
  Object.prototype.hasOwnProperty.call(data || {}, "enumValues");

const commandsHaveVariableEnumPayload = (commands = []) =>
  commands.some(
    (command) =>
      commandHasVariableData(command) &&
      hasVariableEnumPayload(command.payload.data),
  );

const hasAnimationPreviewPayload = (data) =>
  ANIMATION_PREVIEW_METADATA_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(data || {}, key),
  );

const commandsHaveAnimationPreviewPayload = (commands = []) =>
  commands.some(
    (command) =>
      commandHasAnimationData(command) &&
      hasAnimationPreviewPayload(command.payload.data),
  );

const copyAnimationPreviewMetadata = ({ targetItem, sourceItem } = {}) => {
  if (
    !isPlainObject(targetItem) ||
    !isPlainObject(sourceItem) ||
    targetItem.type !== "animation"
  ) {
    return;
  }

  for (const key of ANIMATION_PREVIEW_METADATA_KEYS) {
    if (sourceItem[key] !== undefined) {
      targetItem[key] = structuredClone(sourceItem[key]);
    }
  }
};

const applyAnimationPreviewPayload = ({ item, data } = {}) => {
  if (!isPlainObject(item) || item.type !== "animation") {
    return;
  }

  for (const key of ANIMATION_PREVIEW_METADATA_KEYS) {
    if (data?.[key] !== undefined) {
      item[key] = structuredClone(data[key]);
    }
  }
};

const applyVariableEnumPayload = ({ item, data } = {}) => {
  if (!isPlainObject(item)) {
    return;
  }

  const enumEnabled =
    data?.isEnum === true ||
    (data?.isEnum === undefined && item.isEnum === true);

  if (item.type !== "string" || !enumEnabled) {
    delete item.isEnum;
    delete item.enumValues;
    return;
  }

  item.isEnum = true;
  item.enumValues = normalizeVariableEnumValues(data.enumValues);
};

const copyVariableEnumMetadata = ({ targetItem, sourceItem } = {}) => {
  if (
    !isPlainObject(targetItem) ||
    !isPlainObject(sourceItem) ||
    targetItem.type !== "string" ||
    sourceItem.isEnum !== true
  ) {
    return;
  }

  targetItem.isEnum = true;
  targetItem.enumValues = normalizeVariableEnumValues(sourceItem.enumValues);
};

const restoreVariableEnumMetadata = ({
  baseState,
  nextState,
  commands = [],
} = {}) => {
  if (
    !hasVariableEnumMetadata(baseState) &&
    !commandsHaveVariableEnumPayload(commands)
  ) {
    return nextState;
  }

  const restoredState = structuredClone(nextState);
  const baseVariableItems = getVariableItems(baseState);
  const nextVariableItems = getVariableItems(restoredState);

  for (const [variableId, item] of Object.entries(nextVariableItems)) {
    copyVariableEnumMetadata({
      targetItem: item,
      sourceItem: baseVariableItems[variableId],
    });
  }

  for (const command of commands) {
    if (!commandHasVariableData(command)) {
      continue;
    }

    const variableId = command.payload?.variableId;
    const item = nextVariableItems[variableId];
    if (command.type === VARIABLE_CREATE_COMMAND) {
      applyVariableEnumPayload({
        item,
        data: command.payload.data,
      });
      continue;
    }

    if (
      command.type === VARIABLE_UPDATE_COMMAND &&
      hasVariableEnumPayload(command.payload.data)
    ) {
      applyVariableEnumPayload({
        item,
        data: command.payload.data,
      });
    }
  }

  return restoredState;
};

const restoreAnimationPreviewMetadata = ({
  baseState,
  nextState,
  commands = [],
} = {}) => {
  if (
    !hasAnimationPreviewMetadata(baseState) &&
    !commandsHaveAnimationPreviewPayload(commands)
  ) {
    return nextState;
  }

  const restoredState = structuredClone(nextState);
  const baseAnimationItems = getAnimationItems(baseState);
  const nextAnimationItems = getAnimationItems(restoredState);

  for (const [animationId, item] of Object.entries(nextAnimationItems)) {
    copyAnimationPreviewMetadata({
      targetItem: item,
      sourceItem: baseAnimationItems[animationId],
    });
  }

  for (const command of commands) {
    if (!commandHasAnimationData(command)) {
      continue;
    }

    const animationId = command.payload?.animationId;
    const item = nextAnimationItems[animationId];
    applyAnimationPreviewPayload({
      item,
      data: command.payload.data,
    });
  }

  return restoredState;
};

const restoreClientOwnedMetadata = ({
  baseState,
  nextState,
  commands = [],
} = {}) => {
  const withVariableEnumMetadata = restoreVariableEnumMetadata({
    baseState,
    nextState,
    commands,
  });

  return restoreAnimationPreviewMetadata({
    baseState,
    nextState: withVariableEnumMetadata,
    commands,
  });
};

const toCreatorModelInvalidResult = (error) => {
  const normalizedError = {
    code: error?.code || "validation_failed",
    message: error?.message || "validation failed",
  };

  if (error?.kind) {
    normalizedError.kind = error.kind;
  }

  if (error?.details && typeof error.details === "object") {
    normalizedError.details = error.details;
  }

  if (error) {
    normalizedError.creatorModelError = error;
  }

  return {
    valid: false,
    error: normalizedError,
  };
};

const toCreatorModelResult = (result) => {
  if (result?.valid === false) {
    return toCreatorModelInvalidResult(result.error);
  }

  return result ?? VALID_RESULT;
};

const captureCreatorModelResult = (callback) => {
  try {
    return toCreatorModelResult(callback());
  } catch (error) {
    if (error instanceof CreatorModelAdapterError) {
      return toCreatorModelInvalidResult({
        code: error.code,
        message: error.message,
      });
    }

    throw error;
  }
};

export const commandToCreatorModelCommand = ({ command } = {}) => {
  const normalizedCommand = toCreatorModelCommand(command);

  if (!isPlainObject(normalizedCommand)) {
    throw new CreatorModelAdapterError("command must be an object");
  }

  return normalizedCommand;
};

export const commandsToCreatorModelCommands = ({ commands } = {}) => {
  if (!Array.isArray(commands)) {
    throw new CreatorModelAdapterError("commands must be an array");
  }

  return commands.map((command) =>
    commandToCreatorModelCommand({
      command,
    }),
  );
};

export const applyCommandToRepositoryStateWithCreatorModel = ({
  repositoryState,
  command,
} = {}) => {
  return captureCreatorModelResult(() => {
    const creatorModelState = toCreatorModelState(repositoryState);
    const creatorModelCommand = commandToCreatorModelCommand({
      command,
    });

    if (
      isClientOwnedAnimationPreviewNoop({
        originalCommand: command,
        creatorModelCommand,
      })
    ) {
      return {
        valid: true,
        creatorModelCommand,
        nextCreatorModelState: creatorModelState,
        repositoryState: restoreClientOwnedMetadata({
          baseState: repositoryState,
          nextState: creatorModelState,
          commands: [command],
        }),
      };
    }

    const processResult = toCreatorModelResult(
      processCreatorModelCommand({
        state: creatorModelState,
        command: creatorModelCommand,
      }),
    );
    if (!processResult.valid) {
      return processResult;
    }

    return {
      valid: true,
      creatorModelCommand,
      nextCreatorModelState: processResult.state,
      repositoryState: restoreClientOwnedMetadata({
        baseState: repositoryState,
        nextState: processResult.state,
        commands: [command],
      }),
    };
  });
};

export const applyCommandsToRepositoryStateWithCreatorModel = ({
  repositoryState,
  commands,
} = {}) => {
  return captureCreatorModelResult(() => {
    const creatorModelState = toCreatorModelState(repositoryState);
    const creatorModelCommands = commandsToCreatorModelCommands({
      commands,
    }).filter(
      (creatorModelCommand, index) =>
        !isClientOwnedAnimationPreviewNoop({
          originalCommand: commands[index],
          creatorModelCommand,
        }),
    );
    const replayResult = toCreatorModelResult(
      replayCreatorModelCommands({
        state: creatorModelState,
        commands: creatorModelCommands,
      }),
    );
    if (!replayResult.valid) {
      return replayResult;
    }

    return {
      valid: true,
      creatorModelCommands,
      nextCreatorModelState: replayResult.state,
      repositoryState: restoreClientOwnedMetadata({
        baseState: repositoryState,
        nextState: replayResult.state,
        commands,
      }),
    };
  });
};
