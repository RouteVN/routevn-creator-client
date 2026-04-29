import { generateId } from "../../../internal/id.js";

export const createEmptySpriteGroup = () => ({
  id: generateId(),
  name: "",
  tags: [],
});

const normalizeTagIds = ({ tagIds, validTagIds } = {}) => {
  const seen = new Set();
  const normalizedTagIds = [];

  for (const tagId of tagIds ?? []) {
    if (typeof tagId !== "string" || tagId.length === 0) {
      continue;
    }

    if (validTagIds && !validTagIds.has(tagId)) {
      continue;
    }

    if (seen.has(tagId)) {
      continue;
    }

    seen.add(tagId);
    normalizedTagIds.push(tagId);
  }

  return normalizedTagIds;
};

const normalizeGroupName = (name) => {
  if (typeof name !== "string") {
    return "";
  }

  return name;
};

const normalizeGroupId = (id) => {
  if (typeof id !== "string" || id.length === 0) {
    return generateId();
  }

  return id;
};

export const normalizeSpriteGroupsForDraft = ({
  spriteGroups,
  validTagIds,
} = {}) => {
  if (!Array.isArray(spriteGroups)) {
    return [];
  }

  return spriteGroups
    .filter((spriteGroup) => spriteGroup && typeof spriteGroup === "object")
    .map((spriteGroup) => ({
      id: normalizeGroupId(spriteGroup.id),
      name: normalizeGroupName(spriteGroup.name),
      tags: normalizeTagIds({
        tagIds: spriteGroup.tags,
        validTagIds,
      }),
    }));
};

export const validateSpriteGroupsForSave = ({
  spriteGroups,
  validTagIds,
} = {}) => {
  const normalizedSpriteGroups = normalizeSpriteGroupsForDraft({
    spriteGroups,
    validTagIds,
  }).map((spriteGroup) => ({
    ...spriteGroup,
    name: spriteGroup.name.trim(),
  }));
  const seenIds = new Set();

  for (const [index, spriteGroup] of normalizedSpriteGroups.entries()) {
    if (seenIds.has(spriteGroup.id)) {
      return {
        valid: false,
        message: `Sprite group ${index + 1} has a duplicate id.`,
      };
    }

    seenIds.add(spriteGroup.id);

    if (!spriteGroup.name) {
      return {
        valid: false,
        message: `Sprite group ${index + 1} must have a name.`,
      };
    }

    if (spriteGroup.tags.length === 0) {
      return {
        valid: false,
        message: `Sprite group ${index + 1} must have at least one tag.`,
      };
    }
  }

  return {
    valid: true,
    spriteGroups: normalizedSpriteGroups,
  };
};

const resolveSpriteGroupTagNames = ({ tagIds, tagsById } = {}) =>
  (tagIds ?? []).map((tagId) => tagsById?.[tagId]?.name ?? tagId);

export const buildSpriteGroupViewData = ({ spriteGroups, tagsById } = {}) => {
  return normalizeSpriteGroupsForDraft({
    spriteGroups,
  }).map((spriteGroup) => {
    const tagNames = resolveSpriteGroupTagNames({
      tagIds: spriteGroup.tags,
      tagsById,
    });

    return {
      id: spriteGroup.id,
      name: spriteGroup.name.trim(),
      tags: spriteGroup.tags,
      tagNames,
      tagSummary: tagNames.join(", "),
    };
  });
};

export const buildDraftSpriteGroupViewData = ({
  spriteGroups,
  tagsById,
} = {}) => {
  return normalizeSpriteGroupsForDraft({
    spriteGroups,
  }).map((spriteGroup, index) => {
    const tagNames = resolveSpriteGroupTagNames({
      tagIds: spriteGroup.tags,
      tagsById,
    });

    return {
      id: spriteGroup.id,
      name: spriteGroup.name,
      tags: spriteGroup.tags,
      tagNames,
      tagSummary: tagNames.join(", "),
      label: `Group ${index + 1}`,
    };
  });
};
