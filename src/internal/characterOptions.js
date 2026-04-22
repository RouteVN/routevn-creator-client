import { toFlatItems } from "./project/tree.js";

const DEFAULT_NONE_LABEL = "No Character";

const toCharacterOptionLabel = (character = {}) => {
  const name = character?.name ?? "";
  if (typeof name === "string" && name.length > 0) {
    return name;
  }

  if (
    typeof character?.fullLabel === "string" &&
    character.fullLabel.length > 0
  ) {
    return character.fullLabel;
  }

  return `Unnamed Character (${character?.id ?? ""})`;
};

const toCharacterItems = (charactersData = {}) => {
  return toFlatItems(charactersData).filter(
    (item) => item.type === "character",
  );
};

export const toCharacterSelectOptions = (
  charactersData = {},
  {
    includeNone = false,
    noneLabel = DEFAULT_NONE_LABEL,
    includeMissingValue,
  } = {},
) => {
  const options = toCharacterItems(charactersData).map((character) => ({
    value: character.id,
    label: toCharacterOptionLabel(character),
  }));

  if (
    typeof includeMissingValue === "string" &&
    includeMissingValue.length > 0 &&
    !options.some((option) => option.value === includeMissingValue)
  ) {
    options.unshift({
      value: includeMissingValue,
      label: `Missing Character (${includeMissingValue})`,
    });
  }

  if (includeNone) {
    options.unshift({
      value: "",
      label: noneLabel,
    });
  }

  return options;
};

export const getCharacterOptionLabel = (
  charactersData = {},
  characterId,
  { noneLabel = DEFAULT_NONE_LABEL } = {},
) => {
  if (characterId === "") {
    return noneLabel;
  }

  if (typeof characterId !== "string" || characterId.length === 0) {
    return undefined;
  }

  const character = charactersData?.items?.[characterId];
  if (character?.type === "character") {
    return toCharacterOptionLabel({
      ...character,
      id: characterId,
    });
  }

  return `Missing Character (${characterId})`;
};
