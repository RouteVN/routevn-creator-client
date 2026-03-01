export const MODEL_VERSION = 2;
export const PROTOCOL_VERSION = "1.0";
export const COMMAND_VERSION = 1;

export const PARTITIONS = {
  STORY: "story",
  RESOURCES: "resources",
  LAYOUTS: "layouts",
  SETTINGS: "settings",
};

export const RESOURCE_TYPES = [
  "images",
  "tweens",
  "videos",
  "sounds",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "typography",
  "components",
];

export const COMMAND_TYPES = {
  PROJECT_UPDATE: "project.update",

  SCENE_CREATE: "scene.create",
  SCENE_UPDATE: "scene.update",
  SCENE_RENAME: "scene.rename",
  SCENE_DELETE: "scene.delete",
  SCENE_SET_INITIAL: "scene.set_initial",
  SCENE_REORDER: "scene.reorder",

  SECTION_CREATE: "section.create",
  SECTION_RENAME: "section.rename",
  SECTION_DELETE: "section.delete",
  SECTION_REORDER: "section.reorder",

  LINE_INSERT_AFTER: "line.insert_after",
  LINE_UPDATE_ACTIONS: "line.update_actions",
  LINE_DELETE: "line.delete",
  LINE_MOVE: "line.move",

  RESOURCE_CREATE: "resource.create",
  RESOURCE_UPDATE: "resource.update",
  RESOURCE_RENAME: "resource.rename",
  RESOURCE_MOVE: "resource.move",
  RESOURCE_DELETE: "resource.delete",
  RESOURCE_DUPLICATE: "resource.duplicate",

  LAYOUT_CREATE: "layout.create",
  LAYOUT_RENAME: "layout.rename",
  LAYOUT_DELETE: "layout.delete",
  LAYOUT_REORDER: "layout.reorder",
  LAYOUT_ELEMENT_CREATE: "layout.element.create",
  LAYOUT_ELEMENT_UPDATE: "layout.element.update",
  LAYOUT_ELEMENT_MOVE: "layout.element.move",
  LAYOUT_ELEMENT_DELETE: "layout.element.delete",

  VARIABLE_CREATE: "variable.create",
  VARIABLE_UPDATE: "variable.update",
  VARIABLE_DELETE: "variable.delete",
};

export const ALL_COMMAND_TYPES = Object.values(COMMAND_TYPES);
