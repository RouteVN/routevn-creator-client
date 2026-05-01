import { buildUniqueTagIds } from "../resourceTags.js";

export const getTagSelectDraftValues = ({ tagSelect, fallbackValues } = {}) => {
  const draftValues = tagSelect?.store?.selectDraftSelectedValues?.();
  if (Array.isArray(draftValues) && draftValues.length > 0) {
    return [...draftValues];
  }

  return Array.isArray(fallbackValues) ? [...fallbackValues] : [];
};

export const appendTagToTagSelectDraft = ({
  tagSelect,
  draftValues,
  tagId,
} = {}) => {
  if (!tagId) {
    return;
  }

  if (typeof tagSelect?.appendDraftSelectedValue === "function") {
    tagSelect.appendDraftSelectedValue({
      value: tagId,
      keepOpen: true,
    });
    return;
  }

  if (typeof tagSelect?.setDraftSelectedValues === "function") {
    tagSelect.setDraftSelectedValues({
      values: buildUniqueTagIds(draftValues ?? [], [tagId]),
      keepOpen: true,
    });
  }
};
