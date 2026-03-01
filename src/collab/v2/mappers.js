import {
  committedSyncEventToCommand,
  commandToSyncEvent as mapCommandToSyncEvent,
} from "insieme/client";
import { COMMAND_VERSION } from "../../domain/v2/constants.js";

export const commandToSyncEvent = (command) => mapCommandToSyncEvent(command);

export const committedEventToCommand = (committedEvent) =>
  committedSyncEventToCommand(committedEvent, {
    defaultCommandVersion: COMMAND_VERSION,
  });
