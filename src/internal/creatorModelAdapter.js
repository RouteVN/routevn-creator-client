import {
  normalizeState as normalizeCreatorModelState,
  processCommand as processCreatorModelCommand,
  replayCommands as replayCreatorModelCommands,
} from "@routevn/creator-model";

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

const TRANSFORM_COMMAND_TYPES = new Set([
  "transform.create",
  "transform.update",
]);

const createValidationResult = (message, details) => ({
  valid: false,
  error: {
    code: "validation_failed",
    message,
    ...(details ? { details } : {}),
  },
});

const cloneStateWithoutTransformThumbnails = (state) => {
  const nextState = structuredClone(state);
  const transformItems = nextState?.transforms?.items;
  if (!isPlainObject(transformItems)) {
    return nextState;
  }

  for (const item of Object.values(transformItems)) {
    if (item?.type === "transform") {
      delete item.thumbnailFileId;
      delete item.previewFileId;
      delete item.preview;
    }
  }

  return nextState;
};

export const toCreatorModelState = (state) => {
  return cloneStateWithoutTransformThumbnails(
    normalizeRepositoryStateWithCreatorModel(state),
  );
};

export const normalizeRepositoryStateWithCreatorModel = (state) => {
  return normalizeCreatorModelState({ state });
};

const toCreatorModelCommand = (command) => {
  const nextCommand = structuredClone(command);
  if (
    TRANSFORM_COMMAND_TYPES.has(nextCommand?.type) &&
    isPlainObject(nextCommand.payload?.data)
  ) {
    delete nextCommand.payload.data.thumbnailFileId;
    delete nextCommand.payload.data.previewFileId;
    delete nextCommand.payload.data.preview;
  }

  return nextCommand;
};

const getTransformMetadataCommandEntries = (commands = []) => {
  const entries = [];
  for (const command of commands) {
    if (
      !TRANSFORM_COMMAND_TYPES.has(command?.type) ||
      !isPlainObject(command.payload?.data) ||
      (command.payload.data.thumbnailFileId === undefined &&
        command.payload.data.previewFileId === undefined &&
        command.payload.data.preview === undefined)
    ) {
      continue;
    }

    entries.push({
      transformId: command.payload.transformId,
      thumbnailFileId: command.payload.data.thumbnailFileId,
      previewFileId: command.payload.data.previewFileId,
      preview: command.payload.data.preview,
      type: command.type,
    });
  }

  return entries;
};

const applyExistingTransformMetadata = ({ sourceState, targetState }) => {
  const sourceItems = sourceState?.transforms?.items;
  const targetItems = targetState?.transforms?.items;
  if (!isPlainObject(sourceItems) || !isPlainObject(targetItems)) {
    return;
  }

  for (const [transformId, targetItem] of Object.entries(targetItems)) {
    if (targetItem?.type !== "transform") {
      continue;
    }

    const thumbnailFileId = sourceItems[transformId]?.thumbnailFileId;
    if (thumbnailFileId !== undefined) {
      targetItem.thumbnailFileId = thumbnailFileId;
    }

    const previewFileId = sourceItems[transformId]?.previewFileId;
    if (previewFileId !== undefined) {
      targetItem.previewFileId = previewFileId;
    }

    const preview = sourceItems[transformId]?.preview;
    if (preview !== undefined) {
      targetItem.preview = structuredClone(preview);
    }
  }
};

const applyCommandTransformMetadata = ({ targetState, commands }) => {
  const targetItems = targetState?.transforms?.items;
  if (!isPlainObject(targetItems)) {
    return;
  }

  for (const entry of getTransformMetadataCommandEntries(commands)) {
    const targetItem = targetItems[entry.transformId];
    if (targetItem?.type === "transform") {
      if (entry.thumbnailFileId !== undefined) {
        targetItem.thumbnailFileId = entry.thumbnailFileId;
      }
      if (entry.previewFileId !== undefined) {
        targetItem.previewFileId = entry.previewFileId;
      }
      if (entry.preview !== undefined) {
        targetItem.preview = structuredClone(entry.preview);
      }
    }
  }
};

const validateTransformPreviewSlot = ({
  transformId,
  slotKey,
  slot,
  images,
}) => {
  if (slot === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(slot)) {
    return createValidationResult(
      `transform.preview.${slotKey} must be an object when provided`,
      {
        transformId,
        slot: slotKey,
      },
    );
  }

  for (const key of Object.keys(slot)) {
    if (key !== "imageId") {
      return createValidationResult(
        `transform.preview.${slotKey}.${key} is not allowed`,
        {
          transformId,
          slot: slotKey,
        },
      );
    }
  }

  if (slot.imageId === undefined) {
    return VALID_RESULT;
  }

  if (typeof slot.imageId !== "string" || slot.imageId.length === 0) {
    return createValidationResult(
      `transform.preview.${slotKey}.imageId must be a non-empty string when provided`,
      {
        transformId,
        slot: slotKey,
        imageId: slot.imageId,
      },
    );
  }

  if (
    !isPlainObject(images[slot.imageId]) ||
    images[slot.imageId].type !== "image"
  ) {
    return createValidationResult(
      `transform.preview.${slotKey}.imageId must reference an existing image`,
      {
        transformId,
        slot: slotKey,
        imageId: slot.imageId,
      },
    );
  }

  return VALID_RESULT;
};

const validateTransformPreview = ({ transformId, preview, images }) => {
  if (preview === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(preview)) {
    return createValidationResult(
      "transform.preview must be an object when provided",
      {
        transformId,
      },
    );
  }

  for (const key of Object.keys(preview)) {
    if (key !== "background" && key !== "target") {
      return createValidationResult(`transform.preview.${key} is not allowed`, {
        transformId,
      });
    }
  }

  for (const slotKey of ["background", "target"]) {
    const result = validateTransformPreviewSlot({
      transformId,
      slotKey,
      slot: preview[slotKey],
      images,
    });
    if (result.valid === false) {
      return result;
    }
  }

  return VALID_RESULT;
};

export const validateClientModelStateExtensions = (state) => {
  const fileItems = state?.files?.items ?? {};
  const imageItems = state?.images?.items ?? {};
  const transformItems = state?.transforms?.items ?? {};
  if (!isPlainObject(transformItems)) {
    return VALID_RESULT;
  }

  for (const [transformId, item] of Object.entries(transformItems)) {
    if (item?.type !== "transform") {
      continue;
    }

    for (const fieldName of ["thumbnailFileId", "previewFileId"]) {
      const fileId = item[fieldName];
      if (fileId === undefined) {
        continue;
      }

      if (typeof fileId !== "string" || fileId.length === 0) {
        return createValidationResult(
          `transform.${fieldName} must be a non-empty string when provided`,
          {
            transformId,
            [fieldName]: fileId,
          },
        );
      }

      if (
        !isPlainObject(fileItems[fileId]) ||
        fileItems[fileId].type === "folder"
      ) {
        return createValidationResult(
          `transform.${fieldName} must reference an existing non-folder file`,
          {
            transformId,
            [fieldName]: fileId,
          },
        );
      }
    }

    {
      const result = validateTransformPreview({
        transformId,
        preview: item.preview,
        images: imageItems,
      });
      if (result.valid === false) {
        return result;
      }
    }
  }

  return VALID_RESULT;
};

const mergeClientModelExtensions = ({
  sourceState,
  targetState,
  commands,
} = {}) => {
  const repositoryState = structuredClone(targetState);

  applyExistingTransformMetadata({
    sourceState,
    targetState: repositoryState,
  });
  applyCommandTransformMetadata({
    targetState: repositoryState,
    commands,
  });

  const extensionValidation =
    validateClientModelStateExtensions(repositoryState);
  if (extensionValidation.valid === false) {
    return extensionValidation;
  }

  return {
    valid: true,
    repositoryState,
  };
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

    const processResult = toCreatorModelResult(
      processCreatorModelCommand({
        state: creatorModelState,
        command: creatorModelCommand,
      }),
    );
    if (!processResult.valid) {
      return processResult;
    }
    const extendedState = mergeClientModelExtensions({
      sourceState: repositoryState,
      targetState: processResult.state,
      commands: [command],
    });
    if (extendedState.valid === false) {
      return extendedState;
    }

    return {
      valid: true,
      creatorModelCommand,
      nextCreatorModelState: processResult.state,
      repositoryState: extendedState.repositoryState,
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
    });
    const replayResult = toCreatorModelResult(
      replayCreatorModelCommands({
        state: creatorModelState,
        commands: creatorModelCommands,
      }),
    );
    if (!replayResult.valid) {
      return replayResult;
    }
    const extendedState = mergeClientModelExtensions({
      sourceState: repositoryState,
      targetState: replayResult.state,
      commands,
    });
    if (extendedState.valid === false) {
      return extendedState;
    }

    return {
      valid: true,
      creatorModelCommands,
      nextCreatorModelState: replayResult.state,
      repositoryState: extendedState.repositoryState,
    };
  });
};
