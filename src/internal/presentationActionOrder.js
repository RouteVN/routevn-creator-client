export const PRESENTATION_ACTION_MODE_ORDER = Object.freeze([
  "dialogue",
  "screen",
  "background",
  "character",
  "visual",
  "bgm",
  "voice",
  "sfx",
  "choice",
  "input",
  "setNextLineConfig",
  "sectionTransition",
  "resetStoryAtSection",
  "control",
  "updateVariable",
  "conditional",
]);

export const PRESENTATION_ACTION_CSS_ORDER = Object.freeze(
  Object.fromEntries(
    PRESENTATION_ACTION_MODE_ORDER.map((mode, index, modes) => [
      mode,
      index - modes.length,
    ]),
  ),
);

export const NEUTRAL_PRESENTATION_ACTION_CSS_ORDER = Object.freeze(
  Object.fromEntries(PRESENTATION_ACTION_MODE_ORDER.map((mode) => [mode, 0])),
);
