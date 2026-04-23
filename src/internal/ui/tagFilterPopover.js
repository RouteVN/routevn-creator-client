const DEFAULT_TAG_FILTER_POPOVER_POSITION = Object.freeze({
  x: 0,
  y: 0,
});

const buildTagFilterTagStyle = ({ isSelected = false } = {}) => {
  const style = ["--tag-border-radius: var(--border-radius-md)"];

  if (isSelected) {
    style.push("--muted: var(--accent)");
    style.push("--muted-foreground: white");
  } else {
    style.push(
      "--muted: color-mix(in srgb, var(--muted) 82%, var(--background) 18%)",
    );
    style.push("--muted-foreground: var(--foreground)");
  }

  return `${style.join("; ")};`;
};

const normalizeTagIds = (tagIds) => {
  if (!Array.isArray(tagIds)) {
    return [];
  }

  return [...new Set(tagIds.filter(Boolean))];
};

export const createTagFilterPopoverState = () => ({
  tagFilterPopover: {
    isOpen: false,
    position: { ...DEFAULT_TAG_FILTER_POPOVER_POSITION },
    draftTagIds: [],
  },
});

export const openTagFilterPopover = (
  { state },
  { position, tagIds } = {},
) => {
  state.tagFilterPopover.isOpen = true;
  state.tagFilterPopover.position = {
    x: position?.x ?? DEFAULT_TAG_FILTER_POPOVER_POSITION.x,
    y: position?.y ?? DEFAULT_TAG_FILTER_POPOVER_POSITION.y,
  };
  state.tagFilterPopover.draftTagIds = normalizeTagIds(tagIds);
};

export const closeTagFilterPopover = ({ state }, _payload = {}) => {
  state.tagFilterPopover.isOpen = false;
};

export const toggleTagFilterPopoverTagId = (
  { state },
  { tagId } = {},
) => {
  if (!tagId) {
    return;
  }

  const tagIds = state.tagFilterPopover.draftTagIds;
  const index = tagIds.indexOf(tagId);

  if (index > -1) {
    tagIds.splice(index, 1);
    return;
  }

  tagIds.push(tagId);
};

export const clearTagFilterPopoverTagIds = ({ state }, _payload = {}) => {
  state.tagFilterPopover.draftTagIds = [];
};

export const selectTagFilterPopoverDraftTagIds = ({ state }) => {
  return state.tagFilterPopover.draftTagIds ?? [];
};

export const buildTagFilterPopoverViewData = ({
  state,
  props,
} = {}) => {
  const draftTagIds = normalizeTagIds(state.tagFilterPopover?.draftTagIds);
  const options = (props.tagFilterOptions ?? []).map((option) => {
    const isSelected = draftTagIds.includes(option.value);

    return {
      ...option,
      isSelected,
      tagStyle: buildTagFilterTagStyle({ isSelected }),
    };
  });

  return {
    tagFilterPopover: {
      isOpen: state.tagFilterPopover?.isOpen ?? false,
      position: {
        x: state.tagFilterPopover?.position?.x ?? 0,
        y: state.tagFilterPopover?.position?.y ?? 0,
      },
      options,
      hasOptions: options.length > 0,
      clearDisabled: draftTagIds.length === 0,
    },
  };
};
