import {
  validateCommandEnvelope,
  validateCommandPayload,
} from "./commandCatalog.js";
import { DomainValidationError } from "./errors.js";

export const validateCommand = (command) => {
  const errors = [];

  validateCommandEnvelope(command, errors);
  if (!command || !command.payload || typeof command.payload !== "object") {
    throw new DomainValidationError("Invalid command envelope", { errors });
  }

  validateCommandPayload(command, errors);

  if (errors.length > 0) {
    throw new DomainValidationError("Command validation failed", { errors });
  }

  return true;
};
