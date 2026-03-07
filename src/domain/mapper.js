const toEventType = (commandType) => {
  if (commandType.endsWith(".create"))
    return commandType.replace(".create", ".created");
  if (commandType.endsWith(".rename"))
    return commandType.replace(".rename", ".renamed");
  if (commandType.endsWith(".delete"))
    return commandType.replace(".delete", ".deleted");
  if (commandType.endsWith(".reorder"))
    return commandType.replace(".reorder", ".reordered");
  if (commandType.endsWith(".move"))
    return commandType.replace(".move", ".moved");
  if (commandType.endsWith(".update"))
    return commandType.replace(".update", ".updated");
  if (commandType === "scene.set_initial") return "scene.initial_set";
  if (commandType === "line.insert_after") return "line.inserted";
  if (commandType === "line.update_actions") return "line.actions_updated";
  if (commandType === "resource.duplicate") return "resource.duplicated";
  if (commandType === "layout.element.create") return "layout.element.created";
  if (commandType === "layout.element.update") return "layout.element.updated";
  if (commandType === "layout.element.move") return "layout.element.moved";
  if (commandType === "layout.element.delete") return "layout.element.deleted";
  return commandType;
};

export const commandToEvent = (command) => ({
  type: toEventType(command.type),
  payload: structuredClone(command.payload),
  meta: {
    commandId: command.id,
    projectId: command.projectId,
    actor: structuredClone(command.actor),
    ts: command.clientTs,
  },
});
