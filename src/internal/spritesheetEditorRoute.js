// The spritesheet editor opens a spritesheet resource (`ss`) or a character's
// spritesheet sprite (`characterId` and `sprite`).

const EDITOR_PAYLOAD_KEYS = ["ss", "sprite"];

const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const SPRITESHEET_EDITOR_PATH = "/project/spritesheet-editor";

export const resolveSpritesheetEditorPayload = (payload = {}) => ({
  spritesheetId: getPayloadString(payload, "ss"),
  characterId: getPayloadString(payload, "characterId"),
  spriteId: getPayloadString(payload, "sprite"),
});

export const createSpritesheetEditorPayload = ({
  payload = {},
  spritesheetId,
  characterId,
  spriteId,
} = {}) => {
  const nextPayload = { ...payload };
  for (const key of EDITOR_PAYLOAD_KEYS) {
    delete nextPayload[key];
  }

  if (spritesheetId) {
    nextPayload.ss = spritesheetId;
  }

  if (characterId && spriteId) {
    nextPayload.characterId = characterId;
    nextPayload.sprite = spriteId;
  }

  return nextPayload;
};

export const getSpritesheetEditorBackPath = ({ characterId } = {}) =>
  characterId ? "/project/character-sprites" : "/project/spritesheets";
