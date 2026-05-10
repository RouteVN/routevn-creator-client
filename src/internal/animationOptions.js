import { toFlatItems } from "./project/tree.js";

export const getAnimationResourceType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

export const getTransitionAnimationOptions = (
  animations = {},
  selectedAnimationId,
) => {
  const options = toFlatItems(animations)
    .filter(
      (item) =>
        item.type === "animation" &&
        getAnimationResourceType(item) === "transition",
    )
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));

  if (
    selectedAnimationId &&
    !options.some((option) => option.value === selectedAnimationId)
  ) {
    options.unshift({
      value: selectedAnimationId,
      label: `Missing animation (${selectedAnimationId})`,
    });
  }

  return options;
};
