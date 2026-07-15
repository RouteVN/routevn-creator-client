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
