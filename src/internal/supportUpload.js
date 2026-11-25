// Rules for sending a project to support.

// The largest packed project support accepts.
export const MAX_SUPPORT_UPLOAD_BYTES = 2 * 1024 ** 3;

// A support code: six characters from an alphabet without 0, 1, I and O, so a
// code read out or copied by hand is not mistaken for another.
const DEBUG_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

// The code as typed, in capitals, without spaces or hyphens.
export const normalizeDebugCode = (text) =>
  String(text ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "");

export const isDebugCode = (code) => DEBUG_CODE_PATTERN.test(code);

// What the code field accepts: six characters of the alphabet in either
// case, with spaces or hyphens anywhere, which normalizeDebugCode drops.
export const DEBUG_CODE_INPUT_PATTERN =
  /^[\s-]*(?:[A-HJ-NP-Za-hj-np-z2-9][\s-]*){6}$/;
