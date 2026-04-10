import { COMMAND_ENVELOPE_VERSION } from "../projectCompatibility.js";

export const RESOURCE_TYPES = Object.freeze([
  "images",
  "spritesheets",
  "animations",
  "videos",
  "sounds",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "textStyles",
  "variables",
  "layouts",
  "controls",
]);

export const COLLAB_RESOURCE_TYPES = Object.freeze([
  ...RESOURCE_TYPES,
  "files",
]);

const FILE_COMMAND_TYPES = Object.freeze([
  "file.create",
  "file.delete",
  "file.move",
]);

const RESOURCE_COMMAND_FAMILIES = Object.freeze([
  "image",
  "spritesheet",
  "sound",
  "video",
  "animation",
  "character",
  "font",
  "transform",
  "color",
  "textStyle",
  "variable",
  "layout",
  "control",
]);

const RESOURCE_COMMAND_OPERATIONS = Object.freeze([
  "create",
  "update",
  "move",
  "delete",
]);

const STORY_COMMAND_TYPES = Object.freeze([
  "story.update",
  "scene.create",
  "scene.update",
  "scene.delete",
  "scene.move",
  "section.create",
  "section.update",
  "section.delete",
  "section.move",
  "line.create",
  "line.update_actions",
  "line.delete",
  "line.move",
]);

const LAYOUT_COMMAND_TYPES = Object.freeze([
  "layout.element.create",
  "layout.element.update",
  "layout.element.move",
  "layout.element.delete",
]);

const CONTROL_COMMAND_TYPES = Object.freeze([
  "control.element.create",
  "control.element.update",
  "control.element.move",
  "control.element.delete",
]);

const RESOURCE_COMMAND_TYPES = Object.freeze([
  ...FILE_COMMAND_TYPES,
  ...RESOURCE_COMMAND_FAMILIES.flatMap((family) =>
    RESOURCE_COMMAND_OPERATIONS.map((operation) => `${family}.${operation}`),
  ),
  "character.sprite.create",
  "character.sprite.update",
  "character.sprite.move",
  "character.sprite.delete",
]);

const COMMAND_SCOPE_ENTRIES = Object.freeze([
  ["project.create", "settings"],
  ...STORY_COMMAND_TYPES.map((type) => [type, "story"]),
  ...LAYOUT_COMMAND_TYPES.map((type) => [type, "layouts"]),
  ...CONTROL_COMMAND_TYPES.map((type) => [type, "controls"]),
  ...RESOURCE_COMMAND_TYPES.map((type) => [type, "resources"]),
]);

const COMMAND_SCOPE_BY_TYPE = Object.freeze(
  Object.fromEntries(COMMAND_SCOPE_ENTRIES),
);

export const COMMAND_TYPES = Object.freeze(
  Object.fromEntries(
    Object.keys(COMMAND_SCOPE_BY_TYPE).map((type) => [
      type.replaceAll(".", "_").toUpperCase(),
      type,
    ]),
  ),
);

export const COMMAND_EVENT_MODEL = Object.freeze({
  schemaVersion: COMMAND_ENVELOPE_VERSION,
  requiredEnvelopeFields: Object.freeze([
    "id",
    "projectId",
    "partition",
    "type",
    "payload",
    "actor",
    "clientTs",
    "schemaVersion",
  ]),
  optionalEnvelopeFields: Object.freeze(["meta"]),
});

export const getCommandDefinition = (type) => {
  if (typeof type !== "string" || type.length === 0) {
    return undefined;
  }

  const scope = COMMAND_SCOPE_BY_TYPE[type];
  if (!scope) {
    return undefined;
  }

  return { scope };
};

export const isSupportedCommandType = (type) =>
  getCommandDefinition(type) !== undefined;

const isCommandInScope = (type, scope) =>
  getCommandDefinition(type)?.scope === scope;

export const isStoryCommandType = (type) => isCommandInScope(type, "story");

export const isLayoutCommandType = (type) => isCommandInScope(type, "layouts");

export const isControlCommandType = (type) =>
  isCommandInScope(type, "controls");
