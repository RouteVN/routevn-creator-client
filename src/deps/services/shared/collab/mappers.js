import {
  committedSyncEventToCommand,
  commandToSyncEvent as mapCommandToSyncEvent,
} from "insieme/client";
import { COMMAND_EVENT_MODEL } from "../../../../internal/project/commands.js";

export const commandToSyncEvent = (command) => mapCommandToSyncEvent(command);

export const committedEventToCommand = (committedEvent) =>
  committedSyncEventToCommand(committedEvent, {
    defaultCommandVersion: COMMAND_EVENT_MODEL.commandVersion,
  });
