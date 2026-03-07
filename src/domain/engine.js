import { deepClone } from "./utils.js";
import { validateCommand } from "./validateCommand.js";
import { assertCommandPreconditions } from "./preconditions.js";
import { commandToEvent } from "./mapper.js";
import { applyDomainEvent } from "./reducer.js";
import { assertDomainInvariants } from "./invariants.js";

export const processCommand = ({ state, command }) => {
  validateCommand(command);
  assertCommandPreconditions(state, command);

  const workingState = deepClone(state);
  const event = commandToEvent(command);

  applyDomainEvent(workingState, event);
  assertDomainInvariants(workingState);

  return {
    state: workingState,
    event,
  };
};
