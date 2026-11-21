// The writing modes and base directions of a layout text element, named as
// Route Graphics names them. A text element without them is horizontal and
// left to right.
export const RIGHT_TO_LEFT_TEXT_DIRECTION = "rtl";

const VERTICAL_TEXT_WRITING_MODES = new Set(["vertical-rl", "vertical-lr"]);

export const isVerticalTextWritingMode = (writingMode) =>
  VERTICAL_TEXT_WRITING_MODES.has(writingMode);

export const isRightToLeftTextDirection = (direction) =>
  direction === RIGHT_TO_LEFT_TEXT_DIRECTION;

// The editor offers the text direction as one choice. Route Graphics ignores
// the base direction of vertical text, whose writing mode already sets the
// column order, so these four are all the choices that differ.
export const HORIZONTAL_LEFT_TO_RIGHT_TEXT = "horizontal-ltr";
export const HORIZONTAL_RIGHT_TO_LEFT_TEXT = "horizontal-rtl";

export const getLayoutTextDirectionChoice = ({ writingMode, direction }) => {
  if (isVerticalTextWritingMode(writingMode)) {
    return writingMode;
  }

  return isRightToLeftTextDirection(direction)
    ? HORIZONTAL_RIGHT_TO_LEFT_TEXT
    : HORIZONTAL_LEFT_TO_RIGHT_TEXT;
};

// Defaults are not stored, so horizontal left-to-right text has neither.
export const getLayoutTextDirectionFields = (choice) => {
  const fields = {};
  if (isVerticalTextWritingMode(choice)) {
    fields.writingMode = choice;
  }
  if (choice === HORIZONTAL_RIGHT_TO_LEFT_TEXT) {
    fields.direction = RIGHT_TO_LEFT_TEXT_DIRECTION;
  }

  return fields;
};
