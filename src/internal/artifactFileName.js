const INVALID_ARTIFACT_FILE_NAME_CHARACTERS = '<>:"/\\|?*';
const WINDOWS_RESERVED_FILE_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export const sanitizeArtifactFileName = (
  fileName,
  { fallback = "export" } = {},
) => {
  const sanitized = Array.from(fileName ?? "", (character) => {
    if (
      character.codePointAt(0) < 32 ||
      INVALID_ARTIFACT_FILE_NAME_CHARACTERS.includes(character)
    ) {
      return "-";
    }
    return character;
  })
    .join("")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!sanitized) {
    return fallback;
  }
  if (WINDOWS_RESERVED_FILE_NAME.test(sanitized)) {
    return `_${sanitized}`;
  }
  return sanitized;
};
