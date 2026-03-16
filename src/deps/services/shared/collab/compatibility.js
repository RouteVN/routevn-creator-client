import { validatePayload as validateCreatorModelPayload } from "@routevn/creator-model";
import {
  COMMAND_EVENT_MODEL,
  isSupportedCommandType,
} from "../../../../internal/project/commands.js";
import { commandToCreatorModelCommand } from "../../../../internal/creatorModelAdapter.js";

export const REMOTE_COMMAND_COMPATIBILITY = Object.freeze({
  COMPATIBLE: "compatible",
  FUTURE: "future",
  INVALID: "invalid",
});

const normalizeCommandVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
};

export const getSupportedCommandVersion = () =>
  COMMAND_EVENT_MODEL.commandVersion;

export const getCommandVersion = (command) => {
  return (
    normalizeCommandVersion(command?.commandVersion) ??
    COMMAND_EVENT_MODEL.commandVersion
  );
};

export const evaluateRemoteCommandCompatibility = (
  command,
  { supportedCommandVersion = getSupportedCommandVersion() } = {},
) => {
  const remoteCommandVersion = getCommandVersion(command);

  if (remoteCommandVersion > supportedCommandVersion) {
    return {
      status: REMOTE_COMMAND_COMPATIBILITY.FUTURE,
      reason: "command_version_future",
      supportedCommandVersion,
      remoteCommandVersion,
      message: `commandVersion ${remoteCommandVersion} is newer than supported ${supportedCommandVersion}`,
    };
  }

  if (!isSupportedCommandType(command?.type)) {
    return {
      status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
      reason: "unsupported_command_type",
      supportedCommandVersion,
      remoteCommandVersion,
      message: `Unsupported command type: ${command?.type || "unknown"}`,
    };
  }

  try {
    const creatorModelCommand = commandToCreatorModelCommand({
      command: {
        ...structuredClone(command),
        commandVersion: COMMAND_EVENT_MODEL.commandVersion,
      },
    });
    const payloadResult = validateCreatorModelPayload(creatorModelCommand);
    if (payloadResult?.valid === false) {
      return {
        status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
        reason: "validation_failed",
        supportedCommandVersion,
        remoteCommandVersion,
        message: payloadResult.error?.message || "validation failed",
      };
    }

    return {
      status: REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE,
      reason: "ok",
      supportedCommandVersion,
      remoteCommandVersion,
      message: "ok",
    };
  } catch (error) {
    return {
      status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
      reason: "validation_failed",
      supportedCommandVersion,
      remoteCommandVersion,
      message: error?.message || "validation failed",
    };
  }
};

export const createProjectionGap = ({
  command,
  committedEvent,
  compatibility,
  sourceType,
}) => ({
  committedId: Number.isFinite(Number(committedEvent?.committedId))
    ? Number(committedEvent.committedId)
    : undefined,
  eventId: committedEvent?.id || command?.id || undefined,
  commandId: command?.id || undefined,
  commandType: command?.type || undefined,
  remoteCommandVersion:
    compatibility?.remoteCommandVersion ?? getCommandVersion(command),
  supportedCommandVersion:
    compatibility?.supportedCommandVersion ?? getSupportedCommandVersion(),
  sourceType:
    typeof sourceType === "string" && sourceType.length > 0
      ? sourceType
      : undefined,
  reason: compatibility?.reason || "unknown",
  message: compatibility?.message || "projection skipped",
});
