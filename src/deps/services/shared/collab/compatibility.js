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

const normalizeSchemaVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
};

export const getSupportedSchemaVersion = () =>
  COMMAND_EVENT_MODEL.schemaVersion;

export const getCommandSchemaVersion = (command) => {
  return (
    normalizeSchemaVersion(command?.schemaVersion) ??
    COMMAND_EVENT_MODEL.schemaVersion
  );
};

export const evaluateRemoteCommandCompatibility = (
  command,
  { supportedSchemaVersion = getSupportedSchemaVersion() } = {},
) => {
  const remoteSchemaVersion = getCommandSchemaVersion(command);

  if (remoteSchemaVersion > supportedSchemaVersion) {
    return {
      status: REMOTE_COMMAND_COMPATIBILITY.FUTURE,
      reason: "schema_version_future",
      supportedSchemaVersion,
      remoteSchemaVersion,
      message: `schemaVersion ${remoteSchemaVersion} is newer than supported ${supportedSchemaVersion}`,
    };
  }

  if (!isSupportedCommandType(command?.type)) {
    return {
      status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
      reason: "unsupported_command_type",
      supportedSchemaVersion,
      remoteSchemaVersion,
      message: `Unsupported command type: ${command?.type || "unknown"}`,
    };
  }

  try {
    const creatorModelCommand = commandToCreatorModelCommand({
      command: {
        ...structuredClone(command),
        schemaVersion: COMMAND_EVENT_MODEL.schemaVersion,
      },
    });
    const payloadResult = validateCreatorModelPayload(creatorModelCommand);
    if (payloadResult?.valid === false) {
      return {
        status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
        reason: "validation_failed",
        supportedSchemaVersion,
        remoteSchemaVersion,
        message: payloadResult.error?.message || "validation failed",
      };
    }

    return {
      status: REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE,
      reason: "ok",
      supportedSchemaVersion,
      remoteSchemaVersion,
      message: "ok",
    };
  } catch (error) {
    return {
      status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
      reason: "validation_failed",
      supportedSchemaVersion,
      remoteSchemaVersion,
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
  remoteSchemaVersion:
    compatibility?.remoteSchemaVersion ?? getCommandSchemaVersion(command),
  supportedSchemaVersion:
    compatibility?.supportedSchemaVersion ?? getSupportedSchemaVersion(),
  sourceType:
    typeof sourceType === "string" && sourceType.length > 0
      ? sourceType
      : undefined,
  reason: compatibility?.reason || "unknown",
  message: compatibility?.message || "projection skipped",
});

export const createCommittedCommandProjectionTracker = ({
  supportedSchemaVersion,
} = {}) => {
  let projectionGap;

  return {
    resolveCommittedCommand({
      command,
      committedEvent,
      sourceType,
      isFromCurrentActor,
    }) {
      let compatibility = {
        status: REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE,
        reason: "ok",
      };
      let projectionStatus = "applied";

      if (!isFromCurrentActor) {
        compatibility = evaluateRemoteCommandCompatibility(command, {
          supportedSchemaVersion,
        });

        if (projectionGap) {
          projectionStatus = "skipped_due_to_gap";
        } else if (
          compatibility.status !== REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE
        ) {
          projectionGap = createProjectionGap({
            command,
            committedEvent,
            compatibility,
            sourceType,
          });
          projectionStatus =
            compatibility.status === REMOTE_COMMAND_COMPATIBILITY.FUTURE
              ? "skipped_future"
              : "skipped_invalid";
        }
      }

      return {
        compatibility,
        projectionStatus,
        projectionGap: projectionGap
          ? structuredClone(projectionGap)
          : undefined,
      };
    },
  };
};
