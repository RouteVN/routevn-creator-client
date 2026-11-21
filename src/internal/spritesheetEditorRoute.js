// The spritesheet editor opens a spritesheet resource (`ss`) or a character's
// spritesheet sprite (`characterId` and `sprite`).

const EDITOR_PAYLOAD_KEYS = ["ss", "sprite"];

const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const SPRITESHEET_EDITOR_PATH = "/project/spritesheet-editor";

// A character sprite needs both its character and its sprite. Pages about a
// character keep `characterId` in the route, so it alone does not mean one.
export const resolveSpritesheetEditorPayload = (payload = {}) => {
  const spriteId = getPayloadString(payload, "sprite");
  return {
    spritesheetId: getPayloadString(payload, "ss"),
    characterId: spriteId
      ? getPayloadString(payload, "characterId")
      : undefined,
    spriteId,
  };
};

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
