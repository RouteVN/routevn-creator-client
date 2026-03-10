export const commandToEvent = (command) => ({
  type: command.type,
  payload: structuredClone(command.payload),
  meta: {
    ts: command.clientTs,
  },
});
