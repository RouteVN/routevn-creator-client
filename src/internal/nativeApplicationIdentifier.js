import { generateId } from "./id.js";

export const NATIVE_APPLICATION_IDENTIFIER_PREFIX = "vn.routevn.player.";

const NATIVE_APPLICATION_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export const createNativeApplicationIdentifier = ({
  idGenerator = generateId,
} = {}) => {
  return `${NATIVE_APPLICATION_IDENTIFIER_PREFIX}${idGenerator()}`;
};

export const isValidNativeApplicationIdentifier = (value) => {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    NATIVE_APPLICATION_IDENTIFIER_PATTERN.test(value)
  );
};

export const requireNativeApplicationIdentifier = (value) => {
  if (!isValidNativeApplicationIdentifier(value)) {
    throw new Error(
      "Native application identifier must use reverse-domain notation with only letters, numbers, hyphens, and periods.",
    );
  }

  return value;
};

// A Windows identifier can also be one word, such as my-game. Windows itself
// has no rule for it. The Windows player uses it as its app identifier, which
// names the folder that keeps the saves, and that needs at least one period.
const WINDOWS_APPLICATION_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/;

export const isValidWindowsApplicationIdentifier = (value) => {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    WINDOWS_APPLICATION_IDENTIFIER_PATTERN.test(value)
  );
};

// The identifier the Windows player gets. One word gets the same prefix as a
// new project's identifier. An identifier with a period stays as it is, so
// players exported before keep their saves.
export const createWindowsPlayerApplicationIdentifier = (value) => {
  if (!isValidWindowsApplicationIdentifier(value)) {
    throw new Error(
      "Windows application identifier must use only letters, numbers, hyphens, and periods.",
    );
  }

  return value.includes(".")
    ? value
    : `${NATIVE_APPLICATION_IDENTIFIER_PREFIX}${value}`;
};
