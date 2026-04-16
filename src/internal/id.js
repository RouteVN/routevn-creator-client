import { customAlphabet } from "nanoid";

export const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const DEFAULT_ID_LENGTH = 12;

const idGeneratorsByLength = new Map();

export const getIdGenerator = (length = DEFAULT_ID_LENGTH) => {
  const normalizedLength =
    Number.isInteger(length) && length > 0 ? length : DEFAULT_ID_LENGTH;
  const existingGenerator = idGeneratorsByLength.get(normalizedLength);
  if (existingGenerator) {
    return existingGenerator;
  }

  const nextGenerator = customAlphabet(BASE58_ALPHABET, normalizedLength);
  idGeneratorsByLength.set(normalizedLength, nextGenerator);
  return nextGenerator;
};

export const generateId = (length = DEFAULT_ID_LENGTH) => {
  return getIdGenerator(length)();
};

export const generatePrefixedId = (prefix = "", length = DEFAULT_ID_LENGTH) => {
  return `${prefix}${generateId(length)}`;
};
