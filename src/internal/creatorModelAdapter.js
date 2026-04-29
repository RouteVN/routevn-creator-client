import {
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

export const toCreatorModelState = (state) => {
  return state;
};

const toCreatorModelCommand = (command) => structuredClone(command);

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

    return {
      valid: true,
      creatorModelCommand,
      nextCreatorModelState: processResult.state,
      repositoryState: processResult.state,
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

    return {
      valid: true,
      creatorModelCommands,
      nextCreatorModelState: replayResult.state,
      repositoryState: replayResult.state,
    };
  });
};
